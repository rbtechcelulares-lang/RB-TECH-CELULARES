# Prompt para criar o site de uma nova loja

Cole tudo o que está abaixo da linha no Claude Code (de preferência numa sessão com acesso ao
GitHub onde o site novo vai ficar). Antes, preencha a seção **DADOS DA LOJA**.

---

Quero criar o site de uma loja de celulares igual ao site da RB Tech Celulares, com todas as
funções, mudando só a marca e os dados da loja. A loja nova vai usar a própria chave da IA, o
próprio Supabase e o próprio GitHub/Vercel.

## Como fazer

Não crie do zero. Use como modelo o repositório público
`https://github.com/rbtechcelulares-lang/RB-TECH-CELULARES`, que já tem tudo funcionando:

1. Crie um repositório novo para a loja (nome abaixo) com uma cópia desse modelo. Copie os
   arquivos; não faça fork nem traga o histórico de commits.
2. Leia o `README.md`, `index.html`, `catalogo.html`, `admin.html`, `assets/js/core.js`,
   `assets/js/app.js`, `assets/js/admin.js`, `assets/css/style.css`, `assets/css/admin.css`,
   `api/chat.js`, `api/publicar.js`, `data/catalogo.json`, a pasta `supabase/` e
   `.claude/skills/cadastrar-iphone/SKILL.md` antes de mudar qualquer coisa.
3. Troque a marca e os dados conforme a seção "O que trocar". Não mude a lógica das funções.

## DADOS DA LOJA (preencha)

- Nome da loja:
- Nome curto (para o admin e o título):
- Slogan (use *asteriscos* no trecho destacado):
- Região / cidade (ex.: "Curitiba/PR · Região Metropolitana"):
- WhatsApp da loja (55 + DDD + número, só dígitos):
- Instagram / TikTok / Facebook / e-mail:
- Endereço, link do Google Maps e horário de atendimento:
- Logo (arquivo PNG ou WebP com fundo transparente; vou anexar ou colocar em `img/marca/`):
- Cores: fundo principal, cor de destaque (no modelo é o amarelo/dourado #f5c542) e cor de
  ação (no modelo é o laranja #ff6a00). Se eu não informar, escolha cores que combinem com a logo.
- Nome da assistente de IA (no modelo é "RBChat"):
- O que a loja vende (iPhones novos/seminovos, Xiaomi, MacBook, iPad…; tire do site as
  categorias que a loja não vende):
- Regras de garantia (no modelo: iPhone novo 1 ano; seminovo do 13 em diante 6 meses; abaixo
  do 13, 4 meses):
- Parcelas máximas e taxas da maquininha por parcela (%):
- Faz conserto? (sim/não) e link do sistema de ordens de serviço, se tiver:
- Benefícios na compra (ex.: capa e película, entrega grátis…):
- Senha inicial do admin:
- Nome do repositório novo no GitHub:

## O que trocar (marca e dados)

- Todos os textos "RB Tech", "RB Tech Celulares", "RBChat", "rbtechcelulares", "São José/SC"
  etc. em HTML, JS, CSS, `api/`, `README.md`, `package.json`, a pasta `supabase/` (comentários)
  e a skill de cadastro passam a usar os dados da loja nova.
- O prefixo das chaves do navegador (`rbtech_…` em localStorage/sessionStorage) vira um prefixo
  da loja nova, para não misturar dados se alguém abrir os dois sites no mesmo navegador.
- Logo e ícones: troque `img/marca/` (logo, favicon 32/64, apple-touch-icon) pelos da loja nova
  e gere os tamanhos que faltarem a partir da logo.
- Cores: troque os tokens de cor em `assets/css/style.css` e `assets/css/admin.css` (`:root` e o
  tema da loja). Não espalhe cores soltas; confira contraste de texto em botões e no chat.
- `data/catalogo.json`:
  - Preencha `loja` com os dados acima.
  - Apague os aparelhos, fotos (`img/produtos/`, `img/promo/`) e preços da RB Tech. Deixe 2 ou 3
    aparelhos de exemplo marcados como ocultos, para o lojista ver como cadastrar.
  - Ajuste `pagamento` (parcelas e taxas), `avaliacao` (tabela de entrada; se não souber, deixe
    os valores zerados e avise), `textos`, `chat` (nome, saudação, políticas, informações e
    benefícios da loja nova), `reparos` (link e serviços, ou desligado se a loja não faz
    conserto), `popup` e `blackfriday` (desligados).
  - `rastreamento` (Supabase) vazio: o lojista configura no admin.
  - `loja.senhaHash`: gere o hash da senha inicial no mesmo formato que o admin usa
    (`RB.sha256(prefixo + senha)`, veja `assets/js/core.js` e o login em `admin.js`).
- `api/publicar.js`: o repositório padrão (`GITHUB_REPO`) passa a ser o repositório novo;
  mantenha a leitura por variável de ambiente.
- A garantia automática (`garantia()` em `core.js` e `api/chat.js`) passa a seguir as regras da
  loja nova.
- Os avisos "🔥 Vendeu iPhone…" da Black Friday são vendas inventadas, o que pode ser
  propaganda enganosa (CDC art. 37). Deixe-os desligados por padrão e com um aviso no admin.

## Funções que precisam continuar funcionando (confira cada uma)

Site:
- Página inicial com vitrine, destaque do topo, "Me ajude a escolher" e seções de confiança.
- Página Catálogo com abas por categoria (iPhones novos/seminovos, Xiaomi, MacBooks, iPads).
- Página do aparelho com fotos, checklist, garantia, bateria e cores oficiais por modelo.
- Simulador de troca: o cliente dá o iPhone usado de entrada e as deduções de bateria e
  defeitos não aparecem para ele; mostra a diferença, o Pix e as parcelas com a taxa da
  maquininha.
- Proposta no WhatsApp: pede o nome completo, mostra o aviso antes de abrir o WhatsApp e leva o
  cupom com desconto, se houver.
- Pop-up de cupom (com desconto em R$ ou %, aplicado na simulação) e pop-up de boas-vindas com
  "Preciso de reparo" / "Quero ver celulares", e o formulário de reparo (Apple/Android, marca,
  modelo, defeitos, relato → WhatsApp com especialista ou link do sistema de OS levando os dados
  na URL).
- Modo Black Friday com contagem regressiva no horário de Brasília.
- Registro de cliques no Supabase (o aparelho do lojista não conta).

Assistente de IA (Claude Haiku 5.5, em `api/chat.js`):
- Negocia por etapas: pergunta "só compra ou tem iPhone de entrada?", manda só a diferença, usa
  as ferramentas `proposta_compra`, `proposta_troca`, `calcular_parcelas`, `avaliar_entrada` e
  `salvar_contato`, e não mostra o total com juros.
- Memória no celular do cliente: depois de 5 minutos parada, a conversa recomeça, mas a IA
  lembra o iPhone de entrada, o nome e o cupom.
- "Me ajude a escolher": botões de prioridade, iPhone/Android, faixas de preço e um campo de
  valor livre.
- Botões "Ver proposta" que abrem a proposta pronta (foto, checklist, garantia, entrada, cupom,
  parcelas, nome e WhatsApp obrigatórios).
- Botão do WhatsApp quando a IA não sabe responder, benefícios no fechamento e aviso de que não
  aceita boleto (ajuste se a loja aceitar).
- Responde sobre conserto com o botão do formulário de reparo.
- Economia: cache no prefixo fixo, só as últimas 8 mensagens, saída de 500 tokens, respostas
  fixas sem IA (endereço/horário, pagamento, WhatsApp) e limite diário por visitante.

Admin (`/admin`):
- Barra lateral com as abas: iPhones, Promoções, Cliques, Clientes, Avaliação de entrada,
  Parcelas e taxas, IA, Reparos, Loja e contatos, Textos do site e Publicar. No celular vira
  gaveta com ☰.
- Publicar grava no GitHub pela função `api/publicar.js`. O rascunho antigo não pode apagar
  configurações novas (mesclagem já existe).
- Aba Clientes (CRM): status, anotações, botão "Chamar" com mensagem editável e planilha CSV.

## Chaves e contas (cada lojista tem as suas)

Nunca coloque chave, token ou senha no código, no catálogo ou no chat. Configure por variáveis
de ambiente na Vercel do lojista (Settings › Environment Variables, depois Redeploy):

- `ANTHROPIC_API_KEY`: chave da API do próprio lojista (platform.claude.com › API Keys). Sem
  ela, o chat mostra "indisponível" e o resto do site funciona.
- `GITHUB_TOKEN`: token com permissão só no repositório da loja (Contents: read and write).
- `GITHUB_REPO` (ex.: `conta-da-loja/nome-do-repo`) e, se precisar, `GITHUB_BRANCH`.

Supabase próprio do lojista: rodar `supabase/rastreamento.sql` (trocando a senha do painel no
fim do arquivo), depois `supabase/clientes.sql` e `supabase/chat_limite.sql`, e colar a URL e a
chave pública na aba Cliques do admin.

## Ao terminar

1. Rode o site localmente e teste no celular (390px) e no computador: vitrine, catálogo,
   simulação com e sem entrada, proposta, cupom, pop-ups, formulário de reparo, admin (login,
   cadastrar aparelho, publicar) e o chat com a API simulada (sem a chave real). Corrija o que
   quebrar e confira que nenhum texto, foto, preço, WhatsApp ou chave da RB Tech ficou no
   projeto (`grep -ri "rb tech\|rbtech"`).
2. Atualize o `README.md` com o passo a passo de implantação para o lojista: Vercel, variáveis
   de ambiente, Supabase e primeiro acesso ao admin.
3. Faça o commit no repositório novo e me mostre o resumo. Pergunte antes de fazer o deploy.
