# RB Tech Celulares

Site de vitrine de iPhones com simulador de troca (aparelho de entrada) e parcelamento,
mais um painel administrativo. Site estático: funciona direto na Vercel, sem servidor.

## Páginas

- `index.html` — vitrine, detalhe do produto com checklist, pré-avaliação do usado e simulação de pagamento
  (pagar a diferença ou valor total, Pix e 1x–18x com a taxa da maquininha), envio da proposta pelo WhatsApp.
- `admin.html` (aberto em `/admin`) — painel com as abas:
  - **iPhones**: cadastrar/editar (fotos, cor, modelo, bateria, preço, checklist de Face ID, bateria, sistema,
    câmeras, tela e tampa traseira);
  - **Promoções**: iPhone em evidência no início da página e pop-up de campanha (título, texto, cupom, botão,
    imagem, frequência e datas);
  - **Cliques**: painel com visitas, cliques por aparelho e propostas enviadas ao WhatsApp;
  - **Avaliação de entrada**, **Parcelas e taxas**, **Loja e contatos**, **Textos do site** e **Publicar**.

Todos os dados ficam em `data/catalogo.json`.

## Como o admin publica

1. Acesse `/admin` (senha inicial: `rbtech2026`; troque em **Dados da loja**).
2. As alterações ficam num rascunho no navegador. Use **Pré-visualizar** para ver o site com elas.
3. Em **Publicar**, informe uma vez o token do GitHub (fine-grained token com acesso só a este
   repositório e permissão *Contents: Read and write*). Ao publicar, o painel grava
   `data/catalogo.json` e as fotos em `img/produtos/` na branch principal do repositório
   (ou na branch informada no painel); a Vercel faz o deploy sozinha em ~1 minuto.

A senha do painel é só uma barreira de tela: quem realmente pode alterar o site é quem tem o token.

## Registro de cliques (opcional)

O site registra visitas, cliques em cada iPhone, propostas enviadas ao WhatsApp e cliques no pop-up num
projeto do [Supabase](https://supabase.com) (plano grátis):

1. Crie um projeto, abra **SQL Editor**, cole `supabase/rastreamento.sql`, troque `TROQUE-ESTA-CHAVE` pela
   senha do painel e rode.
2. No admin, aba **Cliques**, cole a *Project URL* e a chave *anon public* e publique.
3. Digite a senha do passo 1 em "Chave do painel".

A chave pública só permite gravar eventos; os números só saem pela função `painel_resumo`, com a senha.

## Cálculo das parcelas

Total no cartão = valor × (1 + taxa% da parcela). Ajuste as taxas em **Parcelas e taxas**.

## Rodar localmente

```
python3 -m http.server 8000
```
e abra http://localhost:8000
