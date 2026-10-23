---
name: cadastrar-iphone
description: Cadastra, edita, oculta ou lista aparelhos (iPhone, MacBook, Xiaomi, iPad) no catálogo da RB Tech Celulares (data/catalogo.json), com fotos, preço, bateria, cor e checklist, no mesmo formato do painel /admin. Use quando o usuário pedir para adicionar/cadastrar/colocar um aparelho no site, mudar preço, bateria, cor, fotos ou checklist de um aparelho, marcar como vendido/esgotado, colocar em destaque/vitrine/topo ou sob encomenda, ou perguntar o que está cadastrado.
---

# Cadastrar iPhone no catálogo da RB Tech

O site é estático: tudo vem de `data/catalogo.json` (lista `produtos`). O painel `/admin` grava esse
arquivo no GitHub e a Vercel publica em ~1 minuto. Esta skill faz o mesmo direto pelo repositório,
usando `scripts/produto.py`, que gera o mesmo formato, ID e fotos que o painel.

## 1. Entender o pedido

Extraia da mensagem (fotos de anúncio, prints e texto solto valem):

| Campo | Obrigatório | Padrão / regra |
|---|---|---|
| modelo | sim | Nome como no painel: `iPhone 15 Pro`, `iPhone 16 Pro Max`, `iPhone 16e`, `iPhone Air`… |
| armazenamento | sim | `64GB`, `128GB`, `256GB`, `512GB`, `1TB` |
| cor | sim | Prefira as cores do painel (ver abaixo); se não souber, `Cores variadas` |
| preço | sim | Preço à vista em reais, sem centavos quebrados se possível |
| condição | não | `Seminovo` (padrão p/ iPhone), `Novo lacrado`, `Vitrine` |
| bateria | não | Saúde em % (seminovo). Sem número → `--sem-bateria` (o site usa a faixa da linha em `bateriaLinha`) |
| garantia | não | Seminovo: `loja.garantiaPadrao` (90 dias). Novo lacrado: `1 ano` |
| preço antigo | não | Só para mostrar "de/por"; precisa ser **maior** que o preço |
| checklist | não | Tudo `ok` por padrão. Defeitos/observações viram `obs` ou `ruim` com nota |
| fotos | não | Sem foto o site desenha uma ilustração na cor; a primeira foto é a capa |
| vitrine / topo | não | `vitrine` = cards de promoção; `topo` = faixa do início. Use com moderação |
| encomenda / prazo | não | Para aparelho que não está em estoque, ex. prazo `5 a 10 dias úteis` |
| observações | não | Texto livre mostrado no detalhe |

Se faltar **modelo, armazenamento, cor ou preço**, pergunte antes de gravar (uma pergunta só, juntando
tudo que falta). O resto usa os padrões.

Cores do painel (com tom já definido): Preto, Branco, Meia-noite, Estelar, Azul, Azul-sierra, Verde, Roxo,
Rosa, Amarelo, (PRODUCT)RED, Grafite, Dourado, Prateado, Titânio natural, Titânio preto, Titânio branco,
Titânio azul, Titânio deserto, Ultramarino, Verde-acinzentado, Laranja cósmico, Azul-intenso, Bordeaux,
Silver, Índigo, Citrus, Sky Blue, Cores variadas. Outra cor → passe também `--cor-hex "#rrggbb"`.

Checklist (`--check item=status[:nota]`): itens `faceid`, `bateria`, `sistema`, `cameras`, `tela`, `tampa`;
status `ok` (Perfeito), `obs` (Observação), `ruim` (Com defeito).

## 2. Ver se já existe

Antes de criar, procure duplicatas — o catálogo tem linhas genéricas como `p-15pro-256gb`:

```
python3 .claude/skills/cadastrar-iphone/scripts/produto.py listar --busca "15 pro"
```

Se já houver o mesmo modelo/armazenamento/cor/condição, pergunte se é para **atualizar** o existente
ou criar **outro** (unidade diferente, com bateria/fotos próprias).

## 3. Gravar

Novo aparelho:

```
python3 .claude/skills/cadastrar-iphone/scripts/produto.py novo \
  --modelo "iPhone 15 Pro" --armazenamento 256GB --cor "Titânio natural" --preco 4599 \
  --bateria 91 --obs "Acompanha cabo" \
  --foto /caminho/frente.jpg --foto /caminho/verso.jpg \
  --check tela=obs:"Risco leve no canto superior"
```

Editar (só os campos passados mudam):

```
python3 .claude/skills/cadastrar-iphone/scripts/produto.py editar --id p-15pro-256gb --preco 4399 --preco-antigo 4599
python3 .claude/skills/cadastrar-iphone/scripts/produto.py editar --id <id> --disponivel nao      # vendido / ocultar
python3 .claude/skills/cadastrar-iphone/scripts/produto.py editar --id <id> --vitrine sim
python3 .claude/skills/cadastrar-iphone/scripts/produto.py editar --id <id> --limpar-fotos --foto nova.jpg
```

- Use `--dry-run` primeiro quando o pedido for ambíguo, e mostre o resultado ao usuário.
- Fotos são reduzidas para 1200px e salvas em WebP em `img/produtos/` (igual ao painel). Fotos enviadas
  no chat precisam estar salvas em disco; peça o arquivo se só houver a imagem na conversa.
- O script recusa gravar se faltar campo, preço ≤ 0, preço antigo ≤ preço, bateria fora de 1–100 ou foto
  inexistente.
- Não apague produtos do JSON: para tirar do site use `--disponivel nao`. Se o produto for o da
  `promocao.produtoId`, avise que a promoção em destaque precisa de outro aparelho.

## 4. Conferir

```
python3 .claude/skills/cadastrar-iphone/scripts/produto.py validar
```

Opcional, para ver no navegador: `python3 -m http.server 8000` na raiz e abrir `http://localhost:8000`.

## 5. Publicar

1. Mostre um resumo curto do que mudou (modelo, preço, à vista no Pix, fotos) — o `git diff data/` ajuda.
2. Faça commit em português no estilo do repositório, ex.: `Cadastra iPhone 15 Pro 256GB Titânio natural`,
   incluindo `data/catalogo.json` e as fotos novas de `img/produtos/`.
3. Só o push para a branch principal publica o site (a Vercel faz o deploy). Se estiver em outra branch,
   pergunte ao usuário antes de levar para a principal.
4. Lembre o usuário: se ele tiver alterações em rascunho no `/admin` ainda não publicadas, ao publicar
   pelo painel ele pode sobrescrever esta mudança — recarregar o painel antes evita isso.
