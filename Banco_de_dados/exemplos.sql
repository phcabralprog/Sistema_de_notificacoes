-- Exemplos opcionais. Execute conectado ao banco sistema_notificacao.
-- Registros ficticios; a repeticao preserva os dados ja cadastrados.
BEGIN;
INSERT INTO public.funcionarios
    (eid, nome, torre, login, login_elevado, status, nova_expiracao, acessos, observacao)
VALUES
    ('DEMO001', 'Ana Exemplo', 'Suporte', 'ana.exemplo', 'adm.ana', 'ativo',
     CURRENT_DATE + 7, 'VPN; Portal interno', 'Cadastro ficticio para testes'),
    ('DEMO002', 'Bruno Exemplo', 'Infraestrutura', 'bruno.exemplo', NULL, 'pendente',
     NULL, 'Portal interno', 'Aguardando aprovacao'),
    ('DEMO003', 'Carla Exemplo', 'Operacoes', 'carla.exemplo', NULL, 'ativo',
     CURRENT_DATE - 1, 'VPN', 'Acesso vencido para teste')
ON CONFLICT (eid) DO NOTHING;
COMMIT;
