# Sistema de gestão de acessos

Aplicação web para cadastrar funcionários, controlar seus acessos e organizar
as equipes de projetos. O frontend e a API são entregues pelo mesmo servidor,
e os dados são armazenados no PostgreSQL.

> O nome original do repositório menciona notificações, mas o envio automático
> de notificações ainda não foi implementado.

## O que é possível fazer

- Cadastrar, consultar, editar e excluir funcionários.
- Pesquisar funcionários por nome ou EID e filtrar por status.
- Cadastrar projetos e vincular funcionários a cada equipe.
- Consultar os dados pela interface web ou pela API REST.
- Listar acessos vencidos ou próximos do vencimento com o script Python.

## Tecnologias

- **Frontend:** HTML, CSS e JavaScript.
- **Backend:** Node.js, Express e `pg`.
- **Banco de dados:** PostgreSQL.
- **Preparação do banco:** Python e Psycopg.
- **Testes:** test runner do Node.js e Playwright.

## Pré-requisitos

Instale estas ferramentas antes de começar:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) **22 ou superior**
- [PostgreSQL](https://www.postgresql.org/download/) instalado e em execução
- [Python](https://www.python.org/downloads/) **3.10 ou superior**

Durante a instalação do PostgreSQL, anote o usuário e a senha escolhidos. Os
exemplos deste guia usam o usuário `postgres`, mas ele pode ser substituído por
outro usuário que tenha permissão para criar um banco de dados.

Confirme as instalações em um terminal:

```text
git --version
node --version
npm --version
python --version
psql --version
```

No Windows, o comando do Python pode ser `py --version` em vez de
`python --version`. O instalador do PostgreSQL nem sempre adiciona `psql` ao
`PATH` do Windows; se apenas esse comando falhar, confirme pelo pgAdmin se o
servidor está instalado e em execução e continue a configuração.

## Instalação do zero

### 1. Baixe o projeto

```bash
git clone https://github.com/phcabralprog/Sistema_de_notificacoes.git
cd Sistema_de_notificacoes
```

Se você recebeu o projeto como arquivo ZIP, extraia-o e abra o terminal na pasta
que contém o `package.json`.

### 2. Instale as dependências do Node.js

```bash
npm ci
```

Use `npm ci` para instalar exatamente as versões registradas no
`package-lock.json`.

### 3. Crie o arquivo de configuração

O arquivo `.env` guarda a conexão local e não é enviado ao Git.

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

No macOS ou Linux:

```bash
cp .env.example .env
```

Abra o novo arquivo `.env` e preencha os dois campos de senha. Em uma instalação
padrão, o resultado será parecido com este:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD="sua_senha_do_postgresql"
DB_NAME=sistema_notificacao
PORT=3000
HOST=127.0.0.1

PGHOST=localhost
PGPORT=5432
PGDATABASE=sistema_notificacao
PGUSER=postgres
PGPASSWORD="sua_senha_do_postgresql"
```

As configurações aparecem em dois formatos porque a aplicação Node.js usa
preferencialmente `DB_*`, enquanto os utilitários Python usam `PG*`. Mantenha os
dois grupos apontando para o mesmo banco. Coloque a senha entre aspas se ela
contiver `#`.

Nunca publique o `.env` nem coloque senhas reais no `.env.example`.

### 4. Prepare o banco de dados

O comando `iniciar` cria o banco `sistema_notificacao`, caso ele ainda não
exista, e aplica a estrutura de tabelas, índices, gatilhos e views. Ele pode ser
executado novamente sem apagar os cadastros existentes.

No Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\banco.py iniciar
```

No macOS ou Linux:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python scripts/banco.py iniciar
```

Se aparecer um erro de permissão para criar o banco, use um usuário PostgreSQL
com a permissão `CREATEDB` ou peça ao administrador para criar o banco indicado
em `PGDATABASE`. Depois, execute o comando `iniciar` novamente para criar as
tabelas.

### 5. Teste a conexão

```bash
npm run db:test
```

A mensagem esperada é:

```text
PostgreSQL conectado; tabelas de funcionarios, projetos e vinculos acessiveis. Nenhum dado alterado.
```

### 6. Inicie a aplicação

```bash
npm start
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000) no navegador. Para encerrar
o servidor, pressione `Ctrl+C` no terminal.

Durante o desenvolvimento, este comando reinicia o backend após alterações:

```bash
npm run dev
```

### 7. Adicione dados de demonstração (opcional)

Este comando adiciona três funcionários fictícios, sem substituir registros
que já existam com os mesmos EIDs:

Windows:

```powershell
.\.venv\Scripts\python.exe scripts\banco.py demonstracao
```

macOS ou Linux:

```bash
./.venv/bin/python scripts/banco.py demonstracao
```

Atualize a página depois de executar o comando.

## Configuração

| Variável | Usada por | Padrão | Descrição |
| --- | --- | --- | --- |
| `DB_HOST` / `PGHOST` | Node / Python | `localhost` | Endereço do PostgreSQL |
| `DB_PORT` / `PGPORT` | Node / Python | `5432` | Porta do PostgreSQL |
| `DB_USER` / `PGUSER` | Node / Python | `postgres` | Usuário do banco |
| `DB_PASSWORD` / `PGPASSWORD` | Node / Python | vazio | Senha do usuário |
| `DB_NAME` / `PGDATABASE` | Node / Python | `sistema_notificacao` | Nome do banco |
| `PORT` | Node | `3000` | Porta da aplicação web |
| `HOST` | Node | `127.0.0.1` | Interface em que o servidor escuta |

As variáveis `DB_*` têm prioridade sobre as equivalentes `PG*` no backend
Node.js. O script Python lê apenas as variáveis `PG*`.

O padrão `HOST=127.0.0.1` deixa a aplicação acessível somente no computador em
que está executando. Não use `HOST=0.0.0.0` para expor esta versão diretamente
na internet: ela ainda não possui autenticação ou autorização de usuários.

## Banco já existente

Para uma instalação nova, use sempre o comando `iniciar`, pois ele já cria toda
a estrutura atual.

Se você possui uma versão antiga que já contém `public.funcionarios`, mas ainda
não possui projetos, aplique somente a migração:

```text
python scripts/banco.py migrar-projetos
```

No Windows, substitua `python` por `py` ou pelo executável da `.venv`. A migração
é reaplicável, não exclui dados e exige que `funcionarios(eid)` seja a chave
primária.

## Comandos úteis

| Comando | Função |
| --- | --- |
| `npm start` | Inicia a aplicação |
| `npm run dev` | Inicia com reinício automático do backend |
| `npm run db:test` | Confere a conexão e as três tabelas principais |
| `npm test` | Executa os testes de API |
| `npm run test:ui` | Executa os testes da interface no navegador |
| `python scripts/banco.py iniciar` | Cria o banco e aplica toda a estrutura |
| `python scripts/banco.py testar` | Executa verificações transacionais do banco |
| `python scripts/banco.py listar` | Lista os funcionários em JSON |
| `python scripts/banco.py vencimentos --dias 30` | Lista acessos que vencem no período |
| `python scripts/banco.py demonstracao` | Insere três registros fictícios |

Use o executável Python da `.venv`, conforme mostrado na instalação, para não
depender de pacotes instalados globalmente.

## Testes automatizados

Com o PostgreSQL configurado e a estrutura criada, execute:

```bash
npm run db:test
npm test
```

Os testes da API consultam o banco configurado, mas isolam as operações de
escrita em tabelas temporárias e transações desfeitas ao final. O usuário do
banco precisa ter permissão para criar tabelas temporárias.

Para os testes de interface, tente primeiro:

```bash
npm run test:ui
```

Por padrão, o Playwright usa o Google Chrome instalado. Se o Chrome não estiver
disponível, instale o Chromium do Playwright e selecione-o para o teste:

Windows PowerShell:

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:ui
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

macOS ou Linux:

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:ui
```

As capturas de falhas ficam em `test-results/` e `artifacts/`. Essas pastas são
ignoradas pelo Git.

## API REST

A API usa a mesma origem da interface. Com a configuração padrão, a base é
`http://127.0.0.1:3000/api`.

| Método | Rota | Ação |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica a conexão com o banco |
| `GET` | `/api/funcionarios` | Lista funcionários |
| `GET` | `/api/funcionarios/:eid` | Busca um funcionário |
| `POST` | `/api/funcionarios` | Cria um funcionário |
| `PUT` | `/api/funcionarios/:eid` | Atualiza um funcionário |
| `DELETE` | `/api/funcionarios/:eid` | Exclui um funcionário e seus vínculos |
| `GET` | `/api/funcionarios/:eid/projetos` | Lista os projetos do funcionário |
| `GET` | `/api/projetos` | Lista projetos |
| `GET` | `/api/projetos/:id` | Busca um projeto |
| `POST` | `/api/projetos` | Cria um projeto |
| `PUT` | `/api/projetos/:id` | Atualiza um projeto |
| `DELETE` | `/api/projetos/:id` | Exclui um projeto e seus vínculos |
| `GET` | `/api/projetos/:id/funcionarios` | Lista a equipe do projeto |
| `POST` | `/api/projetos/:id/funcionarios` | Vincula um ou vários EIDs ao projeto |
| `DELETE` | `/api/projetos/:id/funcionarios/:eid` | Remove um vínculo do projeto |

Requisições `POST` e `PUT` devem enviar JSON com o cabeçalho
`Content-Type: application/json`. Datas usam o formato `YYYY-MM-DD`.

Exemplo de criação de funcionário:

```json
{
  "eid": "00001",
  "nome": "Pessoa de Exemplo",
  "torre": "Suporte",
  "status": "ativo",
  "nova_expiracao": "2027-01-31",
  "acessos": "VPN; Portal"
}
```

Os status aceitos para funcionários são `ativo`, `inativo`, `pendente` e
`bloqueado`. Projetos aceitam `ativo` e `inativo`.

## Estrutura do projeto

```text
.
|-- backend/
|   |-- scripts/              # Teste de conexão
|   |-- src/
|   |   |-- config/           # Ambiente e PostgreSQL
|   |   |-- controllers/      # Operações da API
|   |   |-- middleware/       # Tratamento de erros
|   |   |-- routes/           # Rotas HTTP
|   |   `-- validation/       # Validação dos dados
|   |-- test/                 # Testes da API
|   `-- test-ui/              # Testes do navegador
|-- Banco_de_dados/
|   |-- banco.sql             # Estrutura completa
|   |-- exemplos.sql          # Dados fictícios opcionais
|   `-- migracao_projetos.sql # Migração de versões antigas
|-- frontend/                 # HTML, CSS e JavaScript
|-- scripts/banco.py          # Administração e consultas do banco
|-- .env.example              # Modelo de configuração
|-- package.json              # Comandos e dependências Node.js
`-- requirements.txt          # Dependência Python
```

## Modelo de dados

Um funcionário é identificado pelo `eid`, que é texto para preservar zeros à
esquerda. Os campos disponíveis são:

- `eid` e `nome`: obrigatórios.
- `torre`, `login`, `login_elevado`, `nova_expiracao`, `acessos` e
  `observacao`: opcionais.
- `status`: `pendente` por padrão.
- `criado_em` e `atualizado_em`: controlados pelo banco.

Funcionários e projetos possuem uma relação muitos-para-muitos pela tabela
`funcionario_projeto`. Excluir um projeto remove seus vínculos, mas não exclui
os funcionários. Excluir um funcionário remove seus vínculos e o cadastro.

## Solução de problemas

### `npm` não é reconhecido

Feche e abra novamente o terminal depois de instalar o Node.js. No PowerShell,
se a política de execução bloquear `npm.ps1`, use `npm.cmd` no lugar de `npm`:

```powershell
npm.cmd ci
npm.cmd start
```

### A conexão com o PostgreSQL foi recusada

Confirme que o serviço PostgreSQL está em execução e que host e porta do `.env`
estão corretos. O padrão é `localhost:5432`.

### A autenticação do PostgreSQL falhou

Revise usuário e senha nos dois grupos do `.env`: `DB_*` e `PG*`. A senha do
PostgreSQL não é a senha do Windows ou do GitHub.

### O banco ou uma tabela não existe

Execute novamente o passo **Prepare o banco de dados**. O backend só inicia
depois de encontrar `funcionarios`, `projetos` e `funcionario_projeto`.

### A porta 3000 já está em uso

Encerre o outro processo ou mude `PORT` no `.env`, por exemplo para `3001`, e
abra o endereço correspondente no navegador.

### Alterei o `.env`, mas nada mudou

Encerre o servidor com `Ctrl+C` e inicie-o novamente. O `.env` é lido durante a
inicialização.

## Licença

Consulte o arquivo [LICENSE](LICENSE).
