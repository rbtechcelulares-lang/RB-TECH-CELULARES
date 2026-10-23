#!/usr/bin/env python3
"""Cadastra, edita e lista aparelhos em data/catalogo.json, no mesmo formato que o painel /admin grava.

Exemplos:
  produto.py listar [--busca "15 pro"]
  produto.py novo --modelo "iPhone 15 Pro" --armazenamento 256GB --cor "Titânio natural" --preco 4599 \
      --bateria 91 --foto ~/frente.jpg --foto ~/verso.jpg --check tela=obs:"Risco leve no canto"
  produto.py editar --id p-15pro-256gb --preco 4399 --preco-antigo 4599 --vitrine sim
  produto.py validar
"""
import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
CATALOGO = RAIZ / 'data' / 'catalogo.json'
PASTA_FOTOS = RAIZ / 'img' / 'produtos'

# Espelham assets/js/core.js e assets/js/admin.js
CHECKLIST_ITENS = ['faceid', 'bateria', 'sistema', 'cameras', 'tela', 'tampa']
STATUS = ['ok', 'obs', 'ruim']
CONDICOES = ['Seminovo', 'Novo lacrado', 'Vitrine']
CATEGORIAS = ['iphone', 'macbook', 'xiaomi', 'ipad']
CORES = {
    'Preto': '#22201f', 'Branco': '#f2efe9', 'Meia-noite': '#1f2430', 'Estelar': '#ece5da',
    'Azul': '#a7c1d9', 'Azul-sierra': '#9bb5ce', 'Verde': '#b9cdb5', 'Roxo': '#cdbfdc',
    'Rosa': '#f1cfd4', 'Amarelo': '#f3e3a5', '(PRODUCT)RED': '#c2283b', 'Grafite': '#4a4845',
    'Dourado': '#ead9b9', 'Prateado': '#e3e3e0', 'Titânio natural': '#bdb7ab', 'Titânio preto': '#3a3836',
    'Titânio branco': '#ecebe7', 'Titânio azul': '#3f4a5c', 'Titânio deserto': '#c8ae93', 'Ultramarino': '#5c6fd6',
    'Verde-acinzentado': '#a9bfb6', 'Laranja cósmico': '#d9793b', 'Azul-intenso': '#2f3c5a',
    'Bordeaux': '#5b1a2a', 'Silver': '#d9dadc', 'Índigo': '#3a3f6b', 'Citrus': '#d6d26a', 'Sky Blue': '#a9c8e6',
    'Cores variadas': '#22201f',
}


def slug(txt):
    txt = unicodedata.normalize('NFD', txt.lower())
    txt = ''.join(c for c in txt if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', '-', txt).strip('-')


def categoria(p):
    if p.get('categoria'):
        return p['categoria']
    m = p.get('modelo', '')
    if re.search('macbook', m, re.I):
        return 'macbook'
    if re.search('ipad', m, re.I):
        return 'ipad'
    if re.search('xiaomi|redmi|poco', m, re.I):
        return 'xiaomi'
    return 'iphone'


def carregar():
    return json.loads(CATALOGO.read_text(encoding='utf-8'))


def gravar(cat):
    CATALOGO.write_text(json.dumps(cat, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sim_nao(v):
    v = str(v).strip().lower()
    if v in ('sim', 's', 'true', '1', 'yes', 'y'):
        return True
    if v in ('nao', 'não', 'n', 'false', '0', 'no'):
        return False
    raise argparse.ArgumentTypeError('use sim ou nao')


def reais(v):
    n = float(str(v).replace('R$', '').replace('.', '').replace(',', '.') if ',' in str(v) else str(v).replace('R$', ''))
    return int(n) if n.is_integer() else round(n, 2)


def armazenamento(v):
    v = v.strip().upper().replace(' ', '')
    if re.fullmatch(r'\d+', v):
        v += 'GB'
    if not re.fullmatch(r'\d+(GB|TB)', v):
        raise argparse.ArgumentTypeError('ex.: 128GB, 256GB, 1TB')
    return v


def novo_id(p):
    return 'p-' + slug(f"{p['modelo']} {p['armazenamento']}-{p.get('cor', '')}") + '-' + format(int(time.time() * 1000), 'x')[-4:]


def salvar_foto(origem, pid, k):
    """Reduz para no máximo 1200px e salva em WebP, como o painel faz."""
    from PIL import Image, ImageOps
    origem = Path(origem).expanduser()
    if not origem.is_file():
        sys.exit(f'Foto não encontrada: {origem}')
    img = ImageOps.exif_transpose(Image.open(origem))
    img.thumbnail((1200, 1200))
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')
    PASTA_FOTOS.mkdir(parents=True, exist_ok=True)
    destino = PASTA_FOTOS / f"{pid}-{format(int(time.time() * 1000), 'x')}{k}.webp"
    img.save(destino, 'WEBP', quality=82)
    return destino.relative_to(RAIZ).as_posix()


def aplicar(p, a, novo):
    campos = {
        'modelo': a.modelo, 'armazenamento': a.armazenamento, 'condicao': a.condicao, 'categoria': a.categoria,
        'specs': a.specs, 'garantia': a.garantia, 'cor': a.cor, 'preco': a.preco, 'precoAntigo': a.preco_antigo,
        'observacoes': a.obs, 'topo': a.topo, 'vitrine': a.vitrine, 'disponivel': a.disponivel,
        'encomenda': a.encomenda, 'prazo': a.prazo,
    }
    for k, v in campos.items():
        if v is not None:
            p[k] = v
    if a.cor is not None and a.cor_hex is None and a.cor in CORES:
        p['corHex'] = CORES[a.cor]
    if a.cor_hex is not None:
        p['corHex'] = a.cor_hex
    if a.sem_bateria:
        p['bateria'] = None
    elif a.bateria is not None:
        p['bateria'] = a.bateria
    for item in a.check or []:
        m = re.fullmatch(r'(\w+)=(\w+)(?::(.*))?', item, re.S)
        if not m or m[1] not in CHECKLIST_ITENS or m[2] not in STATUS:
            sys.exit(f'--check inválido: {item!r}. Use item=status[:nota], itens {CHECKLIST_ITENS}, status {STATUS}')
        p.setdefault('checklist', {})[m[1]] = {'status': m[2], 'nota': (m[3] or '').strip()}
    if getattr(a, 'limpar_fotos', False):
        p['fotos'] = []
    if novo:
        p['id'] = novo_id(p)
    for k, foto in enumerate(a.foto or []):
        p['fotos'].append(salvar_foto(foto, p['id'], k))


def problemas(p, ids):
    erros = []
    for campo in ('id', 'modelo', 'armazenamento', 'cor', 'condicao', 'garantia'):
        if not str(p.get(campo) or '').strip():
            erros.append(f'{campo} vazio')
    if ids.count(p.get('id')) > 1:
        erros.append('id repetido')
    if not isinstance(p.get('preco'), (int, float)) or p['preco'] <= 0:
        erros.append('preço deve ser maior que zero')
    if p.get('precoAntigo') and p['precoAntigo'] <= p.get('preco', 0):
        erros.append('preço antigo deve ser maior que o preço (senão o "de/por" não aparece)')
    if p.get('bateria') is not None and not (1 <= p['bateria'] <= 100):
        erros.append('bateria fora de 1–100')
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', str(p.get('corHex', ''))):
        erros.append('corHex inválido')
    for item, c in (p.get('checklist') or {}).items():
        if item not in CHECKLIST_ITENS or c.get('status') not in STATUS:
            erros.append(f'checklist inválido em {item}')  # itens ausentes contam como ok no site
    for f in p.get('fotos', []):
        if not (RAIZ / f).is_file():
            erros.append(f'foto ausente: {f}')
    return erros


def validar(cat):
    ids = [p.get('id') for p in cat['produtos']]
    ruins = {p.get('id'): e for p in cat['produtos'] if (e := problemas(p, ids))}
    promo = cat.get('promocao', {}).get('produtoId')
    if promo and promo not in ids:
        ruins['promocao'] = [f'produtoId {promo} não existe']
    return ruins


def resumo(p):
    bat = f"{p['bateria']}%" if p.get('bateria') else '—'
    flags = ' '.join(f for f, on in (('[topo]', p.get('topo')), ('[vitrine]', p.get('vitrine') if p.get('vitrine') is not None else p.get('destaque')),
                                      ('[encomenda]', p.get('encomenda')), ('[oculto]', p.get('disponivel') is False)) if on)
    return f"{p['id']:<45} {p['modelo']} {p['armazenamento']} · {p['cor']} · {p['condicao']} · bat {bat} · R$ {p['preco']:,.0f} {flags}".replace(',', '.')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    ls = sub.add_parser('listar')
    ls.add_argument('--busca', default='')
    sub.add_parser('validar')
    for nome in ('novo', 'editar'):
        s = sub.add_parser(nome)
        if nome == 'editar':
            s.add_argument('--id', required=True)
            s.add_argument('--limpar-fotos', action='store_true', help='remove as fotos atuais antes de adicionar as novas')
        s.add_argument('--modelo', required=nome == 'novo')
        s.add_argument('--armazenamento', type=armazenamento, required=nome == 'novo')
        s.add_argument('--cor', required=nome == 'novo')
        s.add_argument('--preco', type=reais, required=nome == 'novo')
        s.add_argument('--cor-hex')
        s.add_argument('--condicao', choices=CONDICOES)
        s.add_argument('--categoria', choices=CATEGORIAS)
        s.add_argument('--specs')
        s.add_argument('--garantia')
        s.add_argument('--bateria', type=int)
        s.add_argument('--sem-bateria', action='store_true', help='não informar % (usa a faixa da linha)')
        s.add_argument('--preco-antigo', type=reais)
        s.add_argument('--obs')
        s.add_argument('--topo', type=sim_nao)
        s.add_argument('--vitrine', type=sim_nao)
        s.add_argument('--disponivel', type=sim_nao)
        s.add_argument('--encomenda', type=sim_nao)
        s.add_argument('--prazo')
        s.add_argument('--foto', action='append', help='caminho de uma foto (repita; a primeira é a capa)')
        s.add_argument('--check', action='append', help='item=status[:nota], ex.: tela=obs:"Risco leve"')
        s.add_argument('--dry-run', action='store_true', help='mostra o resultado sem gravar')
    a = ap.parse_args()
    cat = carregar()

    if a.cmd == 'listar':
        termo = a.busca.lower()
        for p in cat['produtos']:
            if termo in ' '.join(str(p.get(k, '')) for k in ('id', 'modelo', 'armazenamento', 'cor', 'condicao')).lower():
                print(resumo(p))
        return

    if a.cmd == 'validar':
        ruins = validar(cat)
        for pid, erros in ruins.items():
            print(f'✕ {pid}: ' + '; '.join(erros))
        print('✓ catálogo ok' if not ruins else f'{len(ruins)} item(ns) com problema')
        sys.exit(1 if ruins else 0)

    if a.cmd == 'novo':
        cat_id = a.categoria or categoria({'modelo': a.modelo})
        iph = cat_id == 'iphone'
        p = {
            'id': '', 'categoria': cat_id, 'modelo': a.modelo, 'armazenamento': a.armazenamento,
            'cor': a.cor, 'corHex': CORES.get(a.cor, '#1f2430'),
            'condicao': 'Seminovo' if iph else 'Novo lacrado', 'specs': '',
            'bateria': None if iph else 100, 'preco': 0, 'precoAntigo': 0,
            'garantia': (cat['loja'].get('garantiaPadrao') or '90 dias') if iph else '1 ano',
            'topo': False, 'vitrine': False, 'disponivel': True, 'encomenda': False, 'prazo': '',
            'fotos': [], 'observacoes': '',
            'checklist': {it: {'status': 'ok', 'nota': ''} for it in CHECKLIST_ITENS},
        }
        if a.condicao == 'Novo lacrado' and a.garantia is None:
            p['garantia'] = '1 ano'
        if a.condicao == 'Novo lacrado' and a.bateria is None and not a.sem_bateria:
            p['bateria'] = 100
        if a.dry_run:
            a.foto = None
        aplicar(p, a, novo=True)
        produtos = cat['produtos']
        produtos.insert(0, p)
    else:
        idx = next((i for i, p in enumerate(cat['produtos']) if p['id'] == a.id), None)
        if idx is None:
            sys.exit(f'id não encontrado: {a.id} (use "listar --busca")')
        p = cat['produtos'][idx]
        p.setdefault('checklist', {})
        p.setdefault('fotos', [])
        if a.dry_run:
            a.foto = None
        aplicar(p, a, novo=False)

    erros = problemas(p, [x['id'] for x in cat['produtos']])
    print(json.dumps(p, ensure_ascii=False, indent=2))
    if erros:
        sys.exit('✕ não gravado: ' + '; '.join(erros))
    if a.dry_run:
        print('(dry-run: nada gravado)')
        return
    gravar(cat)
    print(f'✓ gravado em data/catalogo.json — {resumo(p)}')


if __name__ == '__main__':
    main()
