# RB Tech Celulares

Site de vitrine de iPhones com simulador de troca (aparelho de entrada) e parcelamento,
mais um painel administrativo. Site estático: funciona direto na Vercel, sem servidor.

## Páginas

- `index.html` — vitrine, detalhe do produto com checklist, pré-avaliação do usado e simulação de pagamento
  (pagar a diferença ou valor total, Pix e 1x–18x com a taxa da maquininha), envio da proposta pelo WhatsApp.
- `admin.html` — painel: cadastrar/editar iPhones (fotos, cor, modelo, bateria, preço, checklist de Face ID,
  bateria, sistema, câmeras, tela e tampa traseira), tabela de avaliação dos usados, descontos por defeito,
  taxas de parcelamento e dados da loja.

Todos os dados ficam em `data/catalogo.json`.

## Como o admin publica

1. Acesse `/admin` (senha inicial: `rbtech2026`; troque em **Dados da loja**).
2. As alterações ficam num rascunho no navegador. Use **Pré-visualizar** para ver o site com elas.
3. Em **Publicar**, informe uma vez o token do GitHub (fine-grained token com acesso só a este
   repositório e permissão *Contents: Read and write*). Ao publicar, o painel grava
   `data/catalogo.json` e as fotos em `img/produtos/` na branch principal do repositório
   (ou na branch informada no painel); a Vercel faz o deploy sozinha em ~1 minuto.

A senha do painel é só uma barreira de tela: quem realmente pode alterar o site é quem tem o token.

## Cálculo das parcelas

Total no cartão = valor × (1 + taxa% da parcela). Ajuste as taxas em **Parcelas e taxas**.

## Rodar localmente

```
python3 -m http.server 8000
```
e abra http://localhost:8000
