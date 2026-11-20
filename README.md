# Gestão de acessos: funcionários e projetos

Backend em **Node.js + Express**, conexão com **PostgreSQL pelo Pool do pg** e
frontend em **HTML, CSS e JavaScript**. O Express serve a interface e a API na
mesma origem. Os scripts Python e SQL anteriores foram preservados.

## Iniciar a aplicação no Windows / PowerShell

O Node.js LTS e as dependências já foram instalados nesta máquina. Se o terminal
aberto antes da instalação não reconhecer `node` ou `npm.cmd`, feche e reabra o
VS Code ou atualize o PATH apenas na sessão atual:

```powershell
$env:Path += ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
```

Na pasta raiz do projeto, execute:

```powershell
node --version
npm.cmd install
npm.cmd run db:test
npm.cmd start
```

Abra **http://127.0.0.1:3000**. Para interromper o servidor, use **Ctrl+C**.
`npm.cmd run dev` inicia com reinício automático quando o backend é alterado.
Usamos `npm.cmd` para funcionar mesmo quando o PowerShell bloqueia `npm.ps1`.
Em outra máquina, instale primeiro o Node.js LTS (22 ou superior) e configure
acesso a um servidor PostgreSQL com a tabela existente.

A tela consulta os funcionários ao abrir; o botão **Refresh**
atualiza os dados. É possível cadastrar e editar funcionários pelo modal. A
seção **Projetos** permite criar e editar projetos, abrir a tabela individual de
cada equipe e vincular ou remover funcionários existentes. Um funcionário pode
participar de vários projetos sem duplicação do cadastro global. As pesquisas
por nome ou EID ignoram acentos e podem ser combinadas com o filtro de status.

## Configuração da API

**Nesta máquina não falta preencher nenhuma configuração:** a API reutiliza
as variáveis `PG*` já presentes no `.env`. A senha permanece no backend.
O `.env` e `node_modules/` estão no `.gitignore`.

Para uma nova configuração, copie `.env.example` para `.env` **somente se o
arquivo ainda não existir**, e preencha os dados reais do seu servidor:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD="SUA_SENHA"
DB_NAME=sistema_notificacao
PORT=3000
HOST=127.0.0.1
```

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` têm prioridade,
respectivamente, sobre `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` e `PGDATABASE`.
Não mantenha valores `DB_*` vazios se pretende usar os equivalentes `PG*`.
Para manter os scripts Python, preserve as variáveis `PG*` atuais. Com dotenv,
senhas contendo `#` precisam estar entre aspas.

`npm.cmd run db:test` verifica conexão e leitura de `public.funcionarios`,
`public.projetos` e `public.funcionario_projeto`.
O servidor faz a mesma verificação antes de começar a atender. A inicialização
Node.js não cria banco, tabela, migração ou dados de demonstração.

O servidor escuta em `127.0.0.1` por padrão para uso local. Se a porta estiver
ocupada, encerre a outra instância ou altere `PORT`. Esta versão local não tem
autenticação de usuários. Antes de disponibilizá-la em rede, implemente
autenticação/autorização e configure um usuário PostgreSQL com as permissões
necessárias ao aplicativo.

## Estrutura confirmada no PostgreSQL

A inspeção da tabela existente confirmou **`eid VARCHAR(20)` como chave primária**,
adequada para as rotas individuais. A expiração é **`nova_expiracao DATE`**.
`nome VARCHAR(150)` e `status VARCHAR(30)` são obrigatórios; o status padrão é
`pendente`, com opções `ativo`, `inativo`, `pendente`, `bloqueado`.
`criado_em` e `atualizado_em` são `TIMESTAMPTZ NOT NULL` com valor padrão.
O gatilho existente controla a data de atualização. A tabela de campos e regras
mais abaixo documenta as outras colunas. Os três registros existentes foram
preservados, sem alteração da estrutura do banco.

Projetos usam `id BIGINT` como chave primária. O índice único normalizado impede
nomes repetidos mesmo com diferenças de maiúsculas/minúsculas ou espaços. A
tabela `funcionario_projeto` tem chave primária composta `(funcionario_id,
projeto_id)`, referências às duas entidades e data do vínculo. Excluir um projeto
remove seus vínculos; remover um vínculo ou projeto nunca exclui o funcionário.
Já a exclusão de um funcionário remove primeiro todos os seus vínculos e depois
apaga o cadastro global, dentro da mesma transação.

## Migração de projetos

A migração segura e reaplicável já foi aplicada neste ambiente. Em outra cópia
que já tenha a tabela `funcionarios`, execute uma vez:

```powershell
py scripts/banco.py migrar-projetos
```

O arquivo executado é `Banco_de_dados/migracao_projetos.sql`. Ele valida a chave
primária `funcionarios(eid)`, cria somente as estruturas ausentes e não exclui
registros ou tabelas.

## Endpoints

| Método | Rota | Resultado |
| --- | --- | --- |
| GET | `/api/health` | 200, saúde da conexão |
| GET | `/api/funcionarios` | 200, array JSON com todos os registros |
| GET | `/api/funcionarios/:eid` | 200, objeto JSON; 404 se não encontrado |
| POST | `/api/funcionarios` | 201, objeto criado e cabeçalho Location |
| PUT | `/api/funcionarios/:eid` | 200, objeto atualizado; 404 se não encontrado |
| DELETE | `/api/funcionarios/:eid` | Exclui o cadastro e seus vínculos; 204, ou 404 se não encontrado |
| GET | `/api/funcionarios/:eid/projetos` | Projetos vinculados ao funcionário |
| GET | `/api/projetos` | Lista projetos e quantidade de funcionários |
| GET | `/api/projetos/:id` | Consulta um projeto |
| POST | `/api/projetos` | Cria um projeto |
| PUT | `/api/projetos/:id` | Atualiza um projeto |
| DELETE | `/api/projetos/:id` | Exclui o projeto e somente seus vínculos |
| GET | `/api/projetos/:id/funcionarios` | Lista a equipe do projeto |
| POST | `/api/projetos/:id/funcionarios` | Vincula um ou vários EIDs existentes |
| DELETE | `/api/projetos/:id/funcionarios/:eid` | Remove somente o vínculo |

A listagem retorna todas as colunas de `public.funcionarios` e também o array
`projetos`, agregado a partir dos vínculos de cada funcionário. As propriedades
JSON das colunas mantêm os nomes reais. `nova_expiracao` retorna
`YYYY-MM-DD` ou `null`, sem conversão de fuso; os timestamps retornam como
ISO 8601 em UTC.

POST exige `eid` e `nome`; quando o status é omitido, o banco aplica o padrão.
PUT altera somente os campos enviados e preserva os omitidos. EID é imutável.
Campos opcionais aceitam `null`; textos opcionais vazios são convertidos em
`null`. Campos obrigatórios não aceitam `null` ou texto vazio. Campos desconhecidos,
datas inexistentes, tipos incorretos e textos longos demais retornam 400.
As datas de entrada devem usar `YYYY-MM-DD`.

As consultas parametrizam todos os valores, e os nomes das colunas vêm de uma
lista permitida. Os campos de auditoria são gerenciados pelo banco e não podem
ser enviados no POST/PUT. O corpo deve ser JSON, com limite de 64 KB.

Erros usam o seguinte formato; erros de validação também incluem `error.fields`:

```json
{"error":{"code":"NOT_FOUND","message":"Funcionario nao encontrado."}}
```

EID duplicado retorna 409; conteúdo diferente de JSON, 415; corpo muito grande,
413; conexão indisponível, 503. Erros internos retornam 500 sem SQL ou detalhes
sensíveis. O frontend usa a mesma origem da API, dispensando CORS.

## Testar pelo navegador ou PowerShell

Com `npm.cmd start` em outro terminal, abra:

- http://127.0.0.1:3000 — interface.
- http://127.0.0.1:3000/api/funcionarios — todos os registros em JSON.
- http://127.0.0.1:3000/api/funcionarios/DEMO001 — registro individual, se cadastrado.

Consultas de leitura:

```powershell
$base = 'http://127.0.0.1:3000'
Invoke-RestMethod "$base/api/health"
Invoke-RestMethod "$base/api/funcionarios" | Format-Table
Invoke-RestMethod "$base/api/funcionarios/DEMO001"
# Retorna 404 se o EID não existir:
Invoke-RestMethod "$base/api/funcionarios/NAO_EXISTE"
```

Exemplos **manuais e opcionais** de escrita. Escolha um EID novo e dedicado ao
teste. Os comandos abaixo alteram o banco quando você os executa:

```powershell
$base = 'http://127.0.0.1:3000'
$novo = @{
    eid = 'API_TESTE_001'
    nome = 'Pessoa de Teste'
    torre = 'Suporte'
    status = 'ativo'
    nova_expiracao = '2027-01-31'
    acessos = 'VPN; Portal'
} | ConvertTo-Json
Invoke-RestMethod "$base/api/funcionarios" -Method Post `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($novo))

$alteracao = @{ observacao = 'Atualizado manualmente'; nova_expiracao = $null } | ConvertTo-Json
Invoke-RestMethod "$base/api/funcionarios/API_TESTE_001" -Method Put `
    -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($alteracao))
```

Exclusão explícita e opcional, somente do EID que você criou para teste:

```powershell
Invoke-RestMethod "$base/api/funcionarios/API_TESTE_001" -Method Delete
```

## Testes automatizados

```powershell
npm.cmd run db:test
npm.cmd test
npm.cmd run test:ui
```

**Resultados executados nesta implementação:** conexão aprovada, **29 testes
Node.js aprovados** e **13 testes de navegador aprovados** usando Chrome. A
resposta da API foi comparada ao SELECT
completo, incluindo null, acentos, datas e horários. Os dados reais foram
comparados antes e depois e permaneceram exatamente iguais.

Os testes da API leem a tabela real. Para POST e PUT, usam `pg_temp.funcionarios`,
uma tabela temporária com as restrições da tabela real, dentro de uma transação
desfeita ao final. O DELETE global também é testado em tabelas temporárias,
incluindo a remoção dos vínculos. Os testes não invocam os scripts SQL de inicialização nem os
exemplos antigos. O usuário de teste precisa de permissão `TEMP` no banco.

Os testes do navegador conferem consulta real, botão, pesquisa, filtro, datas,
null, texto tratado sem HTML, carregamento, lista vazia, falhas e celular. Usam
uma instância própria na porta 3100, que deve estar livre, e o Chrome instalado.
Em uma máquina sem Chrome:

```powershell
npx.cmd playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm.cmd run test:ui
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

As capturas ficam em `artifacts/`, ignorada pelo Git. Os logs de erro interno e
conexão recusada em `npm.cmd test` são cenários simulados intencionalmente.

## Organização da aplicação

- `backend/src/config/`: leitura do ambiente e Pool de conexões.
- `backend/src/routes/`: definição dos endpoints.
- `backend/src/controllers/`: operações SQL parametrizadas.
- `backend/src/validation/`: validação dos dados recebidos.
- `backend/src/middleware/`: tratamento centralizado de erros.
- `backend/src/app.js`: Express e frontend na mesma origem.
- `backend/src/server.js`: inicialização e encerramento do servidor.
- `backend/scripts/test-connection.js`: teste de conexão sem alterar dados.
- `backend/test/` e `backend/test-ui/`: testes HTTP e de navegador.
- `frontend/index.html`, `frontend/style.css`, `frontend/script.js`: interface.
- `package.json`, `package-lock.json`, `playwright.config.js`: dependências e testes.

Dependências de execução: `express`, `pg`, `dotenv`. Dependência de testes:
`@playwright/test`. Os testes HTTP usam recursos nativos do Node.js.
O envio de notificações não faz parte desta implementação. Cadastros, edições e
vínculos estão disponíveis tanto na interface quanto nos endpoints documentados.

## Banco e ferramentas Python anteriores

Banco PostgreSQL baseado nas nove colunas da planilha. A conexão foi preparada
para a instalação local do PostgreSQL; não é necessário instalar outro servidor.
O Python usa o driver `psycopg` indicado em `requirements.txt`.

## Executar no terminal do VS Code

Abra o PowerShell na pasta deste projeto:

```powershell
py -m pip install -r requirements.txt
# Na primeira configuração de outra máquina:
# Copy-Item .env.example .env
# Edite .env com os dados da instalação antes de continuar.

py scripts/banco.py iniciar
py scripts/banco.py migrar-projetos
py scripts/banco.py testar
py scripts/banco.py demonstracao
py scripts/banco.py listar
py scripts/banco.py vencimentos --dias 30
```

Nesta máquina o `.env` já está configurado. Não copie `.env.example` por cima
dele, pois isso apaga a senha configurada. O `.env` está excluído do Git.
Variáveis de ambiente `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` e `PGPASSWORD`
têm prioridade sobre o arquivo. A senha pode conter `=` e `#`; ela é lida como
texto, sem interpolação.

`iniciar` cria o banco quando necessário e aplica `Banco_de_dados/banco.sql`,
incluindo as tabelas de projetos e vínculos.
É possível repetir o comando preservando os registros. Ele não faz migrações
automáticas de tabelas antigas com outra estrutura. O usuário precisa de permissão
para criar bancos na primeira execução; esta configuração usa `postgres` para testes locais.

`testar` executa 16 verificações no PostgreSQL real. As alterações dos testes
ocorrem em uma transação desfeita ao final, inclusive em caso de falha.
`demonstracao` insere três registros fictícios identificados por `DEMO001`,
`DEMO002` e `DEMO003`, sem substituir registros existentes com esses EIDs.

## Abrir no pgAdmin

1. Conecte ao servidor instalado usando o usuário e a senha da instalação.
2. Atualize **Databases** e abra **sistema_notificacao**.
3. Em **Schemas > public > Tables**, abra **funcionarios**.
4. Use **View/Edit Data > All Rows** para consultar e editar os registros.
5. No **Query Tool** desse banco, execute:

```sql
SELECT * FROM public.vw_planilha ORDER BY "Nome";
```

Se for necessário registrar o servidor no pgAdmin: host `localhost`, porta `5432`,
banco de manutenção `postgres` e usuário `postgres`. A senha está no `.env` local.

## Estrutura adotada

| Coluna da imagem | Coluna no banco | Regra |
| --- | --- | --- |
| Nome | nome | Texto até 150 caracteres, obrigatório e não vazio |
| EID | eid | Texto até 20 caracteres, chave primária; preserva zeros iniciais |
| Torre | torre | Texto até 100 caracteres, opcional |
| Login | login | Texto até 100 caracteres, opcional |
| Login Elevado | login_elevado | Identificador da conta, opcional; não é senha |
| Status | status | ativo, inativo, pendente ou bloqueado; padrão pendente |
| Nova expiração | nova_expiracao | Data, opcional |
| Acessos | acessos | Descrição livre dos sistemas/permissões, opcional |
| Observação | observacao | Texto livre, opcional |

Os status e o formato livre de Acessos são premissas, pois a imagem só mostra
os títulos. A tabela também guarda `criado_em` e `atualizado_em`; um gatilho
atualiza a segunda coluna quando um registro muda. A view `vw_planilha` apresenta
somente as nove colunas originais, na mesma ordem e com os títulos da imagem.

Uma data vencida não muda o status automaticamente. Assim é possível consultar
acessos ativos que já venceram. As ferramentas Python preparam e consultam o
banco; o envio de notificações não está implementado.

## Consultas e alterações para testes manuais

Execute no Query Tool conectado a `sistema_notificacao`:

```sql
-- Acessos ativos vencidos:
SELECT * FROM public.funcionarios
WHERE status = 'ativo' AND nova_expiracao < CURRENT_DATE;

-- Acessos ativos que vencem hoje ou nos próximos 30 dias:
SELECT * FROM public.funcionarios
WHERE status = 'ativo'
  AND nova_expiracao BETWEEN CURRENT_DATE AND CURRENT_DATE + 30;

-- Teste manual de cadastro, atualização e exclusão.
-- Execute o bloco inteiro: ROLLBACK desfaz suas alterações.
BEGIN;
INSERT INTO public.funcionarios
    (eid, nome, torre, login, status, nova_expiracao, acessos)
VALUES ('MANUAL001', 'Pessoa de Teste', 'Suporte', 'pessoa.teste',
        'ativo', CURRENT_DATE + 15, 'VPN; Portal');

SELECT * FROM public.vw_planilha WHERE "EID" = 'MANUAL001';

UPDATE public.funcionarios
SET status = 'bloqueado', observacao = 'Teste manual'
WHERE eid = 'MANUAL001';

DELETE FROM public.funcionarios WHERE eid = 'MANUAL001';
ROLLBACK;
```

Para remover somente os exemplos, caso não precise mais deles:

```sql
DELETE FROM public.funcionarios
WHERE eid IN ('DEMO001', 'DEMO002', 'DEMO003');
```

## Arquivos

- `Banco_de_dados/banco.sql`: tabela, validações, índice, gatilho e view.
- `Banco_de_dados/exemplos.sql`: três cadastros fictícios opcionais.
- `scripts/banco.py`: conexão configurável, criação do banco, testes e consultas.
- `.env.example`: modelo de configuração sem senha.

O SQL anterior era para MySQL. Esta versão usa a sintaxe do PostgreSQL;
a criação do banco é feita pelo script Python, fora de uma transação.
