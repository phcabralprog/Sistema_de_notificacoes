"""Conexao, preparacao e testes reais no PostgreSQL local."""

import argparse
import json
import os
from pathlib import Path
import sys
import uuid

import psycopg
from psycopg import sql
from psycopg.rows import dict_row


RAIZ = Path(__file__).resolve().parents[1]


def configuracao():
    valores = {}
    arquivo = RAIZ / '.env'
    if arquivo.exists():
        for linha in arquivo.read_text(encoding='utf-8-sig').splitlines():
            linha = linha.strip()
            if not linha or linha.startswith('#'):
                continue
            chave, separador, valor = linha.partition('=')
            if not separador:
                raise ValueError('Linha invalida em .env: use CHAVE=valor.')
            valor = valor.strip()
            if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
                valor = valor[1:-1]
            valores[chave.strip()] = valor
    parametros = {
        'host': ('PGHOST', 'localhost'),
        'port': ('PGPORT', '5432'),
        'dbname': ('PGDATABASE', 'sistema_notificacao'),
        'user': ('PGUSER', 'postgres'),
        'password': ('PGPASSWORD', ''),
    }
    return {
        **{campo: os.environ.get(chave, valores.get(chave, padrao))
           for campo, (chave, padrao) in parametros.items()},
        'connect_timeout': 5,
        'application_name': 'sistema_notificacao_testes',
    }


def conectar(**substituir):
    return psycopg.connect(**(configuracao() | substituir), row_factory=dict_row)


def executar_arquivo(nome):
    with conectar(autocommit=True) as conexao:
        conexao.execute((RAIZ / 'Banco_de_dados' / nome).read_text(encoding='utf-8'))


def iniciar():
    destino = configuracao()['dbname']
    with conectar(dbname='postgres', autocommit=True) as conexao:
        existe = conexao.execute(
            'SELECT 1 FROM pg_database WHERE datname = %s', (destino,)
        ).fetchone()
        if not existe:
            conexao.execute(sql.SQL('CREATE DATABASE {} ENCODING {} TEMPLATE template0').format(
                sql.Identifier(destino), sql.Literal('UTF8')
            ))
            print(f'Banco criado: {destino}')
    executar_arquivo('banco.sql')
    print(f'Estrutura pronta em {destino}.')


def verificar(condicao, mensagem):
    if not condicao:
        raise AssertionError(mensagem)
    print(f'OK: {mensagem}')


def esperar_erro(conexao, tipo, comando, parametros, mensagem):
    try:
        # O savepoint permite seguir com os testes depois do erro esperado.
        with conexao.transaction():
            conexao.execute(comando, parametros)
    except tipo:
        print(f'OK: {mensagem}')
    else:
        raise AssertionError(mensagem)


def testar():
    eid = 'TST' + uuid.uuid4().hex[:16]
    with conectar(autocommit=True) as conexao:
        print('Conexao autenticada com PostgreSQL.')
        # Todas as alteracoes dos testes sao desfeitas, inclusive em caso de falha.
        with conexao.transaction(force_rollback=True):
            linha = conexao.execute('''
                INSERT INTO public.funcionarios
                    (eid, nome, torre, login, login_elevado, status,
                     nova_expiracao, acessos, observacao)
                VALUES (%s, %s, %s, %s, %s, 'ativo', CURRENT_DATE + 7, %s, %s)
                RETURNING *
            ''', (eid, 'João Teste', 'Suporte', 'joao.teste', 'adm.joao',
                  'VPN; Sistema interno', 'Validação de acentuação')).fetchone()
            verificar(linha['nome'] == 'João Teste', 'Cadastro e acentuacao UTF-8')
            registro = conexao.execute(
                'SELECT * FROM public.vw_planilha WHERE "EID" = %s', (eid,)
            ).fetchone()
            verificar(list(registro) == [
                'Nome', 'EID', 'Torre', 'Login', 'Login Elevado', 'Status',
                'Nova expiração', 'Acessos', 'Observação'
            ], 'Consulta com as nove colunas da planilha')
            verificar(registro['Observação'] == 'Validação de acentuação',
                      'Leitura dos valores persistidos')
            esperar_erro(conexao, psycopg.errors.UniqueViolation,
                         'INSERT INTO public.funcionarios (eid, nome) VALUES (%s, %s)',
                         (eid, 'Duplicado'), 'EID duplicado rejeitado')
            esperar_erro(conexao, psycopg.errors.CheckViolation,
                         'UPDATE public.funcionarios SET nome = %s WHERE eid = %s',
                         ('   ', eid), 'Nome vazio rejeitado')
            esperar_erro(conexao, psycopg.errors.NotNullViolation,
                         'UPDATE public.funcionarios SET nome = NULL WHERE eid = %s',
                         (eid,), 'Nome obrigatorio')
            esperar_erro(conexao, psycopg.errors.CheckViolation,
                         'UPDATE public.funcionarios SET eid = %s WHERE eid = %s',
                         (' ', eid), 'EID vazio rejeitado')
            esperar_erro(conexao, psycopg.errors.CheckViolation,
                         'UPDATE public.funcionarios SET status = %s WHERE eid = %s',
                         ('desconhecido', eid), 'Status invalido rejeitado')
            esperar_erro(conexao, psycopg.errors.InvalidDatetimeFormat,
                         'UPDATE public.funcionarios SET nova_expiracao = %s WHERE eid = %s',
                         ('data-invalida', eid), 'Data invalida rejeitada')
            atualizado = conexao.execute('''
                UPDATE public.funcionarios SET status = 'bloqueado', observacao = %s
                WHERE eid = %s RETURNING *
            ''', ('Atualizado pelo teste', eid)).fetchone()
            verificar(atualizado['status'] == 'bloqueado', 'Atualizacao do cadastro')
            verificar(atualizado['atualizado_em'] > linha['atualizado_em'],
                      'Atualizacao automatica da data de alteracao')
            conexao.execute('UPDATE public.funcionarios SET status = DEFAULT WHERE eid = %s', (eid,))
            verificar(conexao.execute(
                'SELECT status FROM public.funcionarios WHERE eid = %s', (eid,)
            ).fetchone()['status'] == 'pendente', 'Status padrao pendente')
            conexao.execute("UPDATE public.funcionarios SET status = 'ativo' WHERE eid = %s", (eid,))
            encontrado = conexao.execute('''
                SELECT eid FROM public.funcionarios
                WHERE status = 'ativo' AND nova_expiracao BETWEEN CURRENT_DATE
                    AND CURRENT_DATE + 30 AND eid = %s
            ''', (eid,)).fetchone()
            verificar(encontrado is not None, 'Filtro de acessos a vencer em 30 dias')
            conexao.execute('UPDATE public.funcionarios SET nova_expiracao = CURRENT_DATE - 1 WHERE eid = %s', (eid,))
            verificar(conexao.execute('''
                SELECT eid FROM public.funcionarios WHERE status = 'ativo'
                AND nova_expiracao < CURRENT_DATE AND eid = %s
            ''', (eid,)).fetchone() is not None, 'Filtro de acessos vencidos')
            conexao.execute('DELETE FROM public.funcionarios WHERE eid = %s', (eid,))
            verificar(conexao.execute(
                'SELECT 1 FROM public.funcionarios WHERE eid = %s', (eid,)
            ).fetchone() is None, 'Exclusao do cadastro')
            # Deixa uma linha pendente para comprovar o rollback da transacao.
            conexao.execute('INSERT INTO public.funcionarios (eid, nome) VALUES (%s, %s)', (eid, 'Rollback'))
        verificar(conexao.execute(
            'SELECT 1 FROM public.funcionarios WHERE eid = %s', (eid,)
        ).fetchone() is None, 'Rollback remove todos os dados do teste')
    print('Todos os 16 testes passaram.')


def listar(dias=None):
    with conectar() as conexao:
        if dias is None:
            linhas = conexao.execute('SELECT * FROM public.vw_planilha ORDER BY "Nome", "EID"').fetchall()
        else:
            linhas = conexao.execute('''
                SELECT * FROM public.vw_planilha
                WHERE "Status" = 'ativo'
                  AND "Nova expiração" BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
                ORDER BY "Nova expiração", "EID"
            ''', (dias,)).fetchall()
        print(json.dumps(linhas, ensure_ascii=False, indent=2, default=str))


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('comando', choices=[
        'iniciar', 'migrar-projetos', 'testar', 'demonstracao', 'listar', 'vencimentos'
    ])
    parser.add_argument('--dias', type=int, default=30, help='Prazo para vencimentos (padrao: 30).')
    args = parser.parse_args()
    if args.dias < 0:
        parser.error('--dias deve ser maior ou igual a zero.')
    try:
        if args.comando == 'iniciar':
            iniciar()
        elif args.comando == 'migrar-projetos':
            executar_arquivo('migracao_projetos.sql')
            print('Migracao de projetos aplicada sem excluir dados existentes.')
        elif args.comando == 'testar':
            testar()
        elif args.comando == 'demonstracao':
            executar_arquivo('exemplos.sql')
            print('Tres cadastros ficticios disponiveis. Use listar para consultar.')
        else:
            listar(args.dias if args.comando == 'vencimentos' else None)
    except (psycopg.Error, ValueError, OSError, AssertionError) as erro:
        print(f'Falha: {erro}', file=sys.stderr)
        print('Confira o servico PostgreSQL e os parametros de .env.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
