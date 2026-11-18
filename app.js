const $ = seletor => document.querySelector(seletor);
const moeda = valor => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = valor => valor.slice(0, 10).split('-').reverse().join('/');
const nomes = {
  inicial: 'Saldo inicial', entrada: 'Entrada', venda: 'Venda', saida: 'Outra saída',
  em_transito: 'Em trânsito', parcial: 'Recebido parcialmente', recebido: 'Recebido',
  debito: 'Débito', credito: 'Crédito', pix: 'Pix', vale: 'Vale',
  administrador: 'Administrador', gerente: 'Gerente', funcionario: 'Funcionário'
};

let usuario;
let produtos = [];
let tela = 'estoque';
let carregamento = 0;
let produtoEmEdicao = null;

function elemento(tag, texto, atributos = {}) {
  const item = document.createElement(tag);
  if (texto != null) item.textContent = texto;
  for (const [nome, valor] of Object.entries(atributos)) item.setAttribute(nome, valor);
  return item;
}

function aviso(texto, erro = false) {
  const mensagem = $('#mensagem');
  mensagem.hidden = !texto;
  mensagem.textContent = texto;
  mensagem.classList.toggle('erro', erro);
}

async function api(rota, metodo = 'GET', dados) {
  if (metodo !== 'GET' || !Object.hasOwn(dadosDemo, rota)) {
    throw new Error('Demonstração somente para consulta.');
  }
  return structuredClone(dadosDemo[rota]);
}

function mostrarLogin() {
  editarProduto();
  usuario = null;
  carregamento++;
  $('#sistema').hidden = true;
  $('#login').hidden = false;
  $('#identidade').textContent = '';
}

function gestao() {
  return usuario?.perfil !== 'funcionario';
}

function tabela(destino, titulos, linhas) {
  const local = $(destino);
  local.replaceChildren();
  if (!linhas.length) {
    local.append(elemento('p', 'Nenhum registro encontrado.'));
    return;
  }
  const tabela = elemento('table');
  const cabecalho = tabela.createTHead().insertRow();
  for (const titulo of titulos) cabecalho.append(elemento('th', titulo, { scope: 'col' }));
  const corpo = tabela.createTBody();
  for (const linha of linhas) {
    const tr = corpo.insertRow();
    for (const valor of linha) {
      const td = tr.insertCell();
      if (valor instanceof Node) td.append(valor);
      else td.textContent = valor ?? '—';
    }
  }
  local.append(tabela);
}

function botao(texto, acao) {
  const item = elemento('button', texto, { type: 'button' });
  item.addEventListener('click', async () => {
    item.disabled = true;
    try {
      await acao();
    } catch (erro) {
      aviso(erro.message, true);
    } finally {
      item.disabled = false;
    }
  });
  return item;
}

function formulario(form, enviar, atualizar = true) {
  form.addEventListener('submit', async evento => {
    evento.preventDefault();
    const botao = form.querySelector('button[type="submit"], button:not([type])');
    if (botao.disabled) return;
    botao.disabled = true;
    try {
      const dados = Object.fromEntries(new FormData(form));
      const retorno = await enviar(dados);
      form.reset();
      if (atualizar) await abrir(tela);
      aviso(retorno?.mensagem || '');
    } catch (erro) {
      aviso(erro.message, true);
    } finally {
      botao.disabled = false;
    }
  });
}

function opcoes(select, lista, valor, texto) {
  select.replaceChildren(elemento('option', 'Selecione', { value: '' }));
  for (const item of lista) select.append(elemento('option', texto(item), { value: valor(item) }));
}

function baixo(produto) {
  return produto.saldo <= produto.estoque_minimo;
}

function indicador(titulo, valor, destaque = false) {
  const cartao = elemento('div', null, { class: destaque ? 'indicador alerta' : 'indicador' });
  cartao.append(elemento('dt', titulo), elemento('dd', valor));
  return cartao;
}

function editarProduto(produto = null) {
  const form = $('#produto');
  form.reset();
  produtoEmEdicao = produto?.id ?? null;
  $('#titulo-produto').textContent = produto ? 'Editar produto' : 'Cadastrar produto';
  $('#salvar-produto').textContent = produto ? 'Salvar alterações' : 'Cadastrar produto';
  $('#cancelar-edicao').hidden = !produto;
  $('#saldo-inicial').hidden = Boolean(produto);
  form.elements.saldo.disabled = Boolean(produto);
  form.elements.sku.readOnly = Boolean(produto);
  if (produto) {
    for (const campo of ['nome', 'sku', 'codigo_barras', 'preco', 'custo', 'estoque_minimo']) {
      form.elements[campo].value = produto[campo] ?? '';
    }
    form.elements.nome.focus();
    form.scrollIntoView({ block: 'nearest' });
  }
  margem();
}

function listarProdutos() {
  const termo = $('#busca').value.toLowerCase().trim();
  const lista = produtos.filter(p => [p.nome, p.sku, p.codigo_barras].some(v => v?.toLowerCase().includes(termo)));
  const visiveis = $('#somente-baixo').checked ? lista.filter(baixo) : lista;
  if ($('#ordem').value === 'saidas') visiveis.sort((a, b) => b.saidas - a.saidas);
  if ($('#ordem').value === 'baixo') visiveis.sort((a, b) => Number(baixo(b)) - Number(baixo(a)));
  const titulos = ['SKU', 'Produto', 'Preço', 'Saldo', 'Mínimo', 'Saídas em 30 dias', 'Em trânsito'];
  if (gestao()) titulos.push('Custo', 'Ação');
  tabela('#lista-produtos', titulos, visiveis.map(p => {
    const saldo = baixo(p) ? elemento('span', p.saldo + ' · Baixo', { class: 'baixo' }) : p.saldo;
    const linha = [p.sku, p.nome, moeda(p.preco), saldo, p.estoque_minimo, p.saidas, p.em_transito];
    if (gestao()) {
      const acoes = elemento('div', null, { class: 'acoes' });
      acoes.append(botao('Editar', () => editarProduto(p)));
      if (p.saldo === 0 && Number(p.em_transito) === 0) acoes.append(botao('Arquivar', async () => {
        if (!confirm('Arquivar ' + p.nome + '?')) return;
        const resultado = await api('produtos/' + p.id, 'DELETE');
        await abrir('estoque');
        aviso(resultado.mensagem);
      }));
      linha.push(p.custo == null ? '—' : moeda(p.custo), acoes);
    }
    return linha;
  }));
  const comEstoqueBaixo = produtos.filter(baixo).length;
  $('#resumo').replaceChildren(
    indicador('Produtos ativos', produtos.length),
    indicador('Unidades em estoque', produtos.reduce((total, p) => total + Number(p.saldo), 0)),
    indicador('Produtos com estoque baixo', comEstoqueBaixo, comEstoqueBaixo > 0),
    indicador('Unidades em trânsito', produtos.reduce((total, p) => total + Number(p.em_transito), 0)));
}

function camposMovimento() {
  const tipo = $('#movimento').elements.tipo.value;
  for (const campo of document.querySelectorAll('[data-tipo]')) {
    campo.hidden = campo.dataset.tipo !== tipo;
    const controle = campo.querySelector('input, select');
    controle.disabled = campo.hidden;
    controle.required = !campo.hidden;
  }
}

function mostrarMovimentos(lista, parceiros) {
  const form = $('#movimento');
  opcoes(form.elements.sku, produtos, p => p.sku, p => p.sku + ' · ' + p.nome);
  opcoes(form.elements.fornecedor_id, parceiros, f => f.id, f => f.nome_fantasia);
  camposMovimento();
  const titulos = ['Data e hora', 'Produto', 'Operação', 'Qtd.', 'NF', 'Fornecedor', 'Pagamento', 'Responsável'];
  if (gestao()) titulos.push('Custo unitário', 'Preço unitário');
  tabela('#historico', titulos, lista.map(m => {
    const linha = [data(m.criado_em) + ' ' + m.criado_em.slice(11), m.nome, nomes[m.tipo],
      m.quantidade, m.nota_fiscal, m.fornecedor, nomes[m.pagamento], m.usuario];
    if (gestao()) linha.push(m.custo_unitario == null ? '—' : moeda(m.custo_unitario),
      m.preco_unitario == null ? '—' : moeda(m.preco_unitario));
    return linha;
  }));
}

function formatarCnpj(valor) {
  return valor.replace(/\D/g, '').slice(0, 14)
    .replace(/^(\d{2})(?=\d)/, '$1.').replace(/(\.\d{3})(?=\d)/, '$1.')
    .replace(/(\.\d{3}\.\d{3})(?=\d)/, '$1/').replace(/(\/\d{4})(?=\d)/, '$1-');
}

function mostrarFornecedores(lista) {
  tabela('#lista-fornecedores', ['CNPJ', 'Razão social', 'Nome fantasia', 'Telefone', 'E-mail', 'Status', 'Ação'],
    lista.map(f => [formatarCnpj(f.cnpj), f.razao_social, f.nome_fantasia, f.telefone, f.email,
      f.ativo ? 'Ativo' : 'Inativo', botao(f.ativo ? 'Desativar' : 'Ativar', async () => {
        const resultado = await api('fornecedores/' + f.id, 'PATCH', { ativo: !f.ativo });
        await abrir('fornecedores');
        aviso(resultado.mensagem);
      })]));
}

function imprimirPedido(pedido, empresa) {
  const janela = window.open('', '_blank', 'width=800,height=650');
  if (!janela) throw new Error('Permita a abertura da janela de impressão.');
  janela.opener = null;
  const documento = janela.document;
  documento.title = 'Pedido de compra ' + pedido.id;
  const corpo = documento.body;
  corpo.style.fontFamily = 'system-ui';
  corpo.append(elemento('h1', empresa), elemento('h2', documento.title),
    elemento('p', 'Fornecedor: ' + pedido.razao_social + ' · CNPJ ' + formatarCnpj(pedido.cnpj)),
    elemento('p', 'Entrega prevista: ' + data(pedido.entrega_prevista)),
    elemento('p', 'Condições de pagamento: ' + pedido.condicoes_pagamento));
  const lista = elemento('ul');
  for (const item of pedido.itens) lista.append(elemento('li', item.sku + ' · ' + item.nome + ' · ' + item.quantidade + ' un.'));
  corpo.append(lista);
  janela.focus();
  janela.print();
}

function formularioRecebimento(pedido) {
  const form = elemento('form');
  const nota = elemento('input', null, { name: 'nota_fiscal', required: '', maxlength: '60' });
  const rotulo = elemento('label', 'Número da nota fiscal');
  rotulo.append(nota);
  form.append(rotulo);
  const campos = [];
  for (const item of pedido.itens.filter(i => i.recebida < i.quantidade)) {
    const restante = item.quantidade - item.recebida;
    const grupo = elemento('fieldset');
    grupo.append(elemento('legend', item.sku + ' · ' + item.nome + ' · ' + restante + ' pendentes'));
    const incluir = elemento('input', null, { type: 'checkbox' });
    const conferencia = elemento('label', 'Conferido ');
    conferencia.append(incluir);
    const quantidade = elemento('input', null, { type: 'number', min: 1, max: restante, value: restante, disabled: '', required: '' });
    const custo = elemento('input', null, { type: 'number', min: 0, step: '0.01', disabled: '', required: '' });
    const rotuloQtd = elemento('label', 'Quantidade recebida');
    const rotuloCusto = elemento('label', 'Custo unitário do lote (R$)');
    rotuloQtd.append(quantidade);
    rotuloCusto.append(custo);
    incluir.addEventListener('change', () => {
      quantidade.disabled = !incluir.checked;
      custo.disabled = !incluir.checked;
    });
    grupo.append(conferencia, rotuloQtd, rotuloCusto);
    campos.push({ id: item.id, incluir, quantidade, custo });
    form.append(grupo);
  }
  form.append(elemento('button', 'Confirmar recebimento'));
  formulario(form, dados => {
    const itens = campos.filter(c => c.incluir.checked).map(c => ({
      id: c.id, quantidade: c.quantidade.value, custo: c.custo.value
    }));
    return api('pedidos/' + pedido.id + '/receber', 'POST', { ...dados, itens });
  });
  return form;
}

function mostrarPedidos(resultado, parceiros) {
  opcoes($('#pedido').elements.fornecedor_id, parceiros.filter(f => f.ativo),
    f => f.id, f => f.nome_fantasia);
  const reposicao = $('#reposicao');
  reposicao.replaceChildren();
  for (const produto of produtos) {
    const falta = produto.estoque_minimo - produto.saldo - Number(produto.em_transito);
    if (falta <= 0) continue;
    const rotulo = elemento('label');
    rotulo.append(elemento('input', null, { type: 'checkbox', name: 'produtos', value: produto.id }),
      ' ' + produto.nome + ' · ' + falta + ' un.');
    reposicao.append(rotulo);
  }
  if (!reposicao.children.length) reposicao.append(elemento('p', 'Nenhum produto precisa de reposição.'));
  const lista = $('#lista-pedidos');
  lista.replaceChildren();
  if (!resultado.pedidos.length) lista.append(elemento('p', 'Nenhum pedido registrado.'));
  for (const pedido of resultado.pedidos) {
    const artigo = elemento('article');
    artigo.append(elemento('h3', 'Pedido ' + pedido.id + ' · ' + nomes[pedido.status]),
      elemento('p', pedido.fornecedor + ' · Entrega em ' + data(pedido.entrega_prevista)),
      elemento('p', pedido.condicoes_pagamento));
    const itens = elemento('ul');
    for (const item of pedido.itens) itens.append(elemento('li', item.nome + ' · ' + item.recebida + ' de ' + item.quantidade + ' recebidos'));
    artigo.append(itens);
    if (gestao()) {
      const assunto = encodeURIComponent('Pedido de compra ' + pedido.id + ' · ' + resultado.empresa);
      const corpo = encodeURIComponent('Olá! Segue em anexo o pedido de compra ' + pedido.id + '.');
      artigo.append(botao('Imprimir / salvar PDF', () => imprimirPedido(pedido, resultado.empresa)),
        ' ', elemento('a', 'Abrir e-mail para envio', { href: 'mailto:' + encodeURIComponent(pedido.email) + '?subject=' + assunto + '&body=' + corpo }));
    }
    if (pedido.status !== 'recebido') {
      const detalhes = elemento('details');
      detalhes.append(elemento('summary', 'Conferir recebimento'), formularioRecebimento(pedido));
      artigo.append(detalhes);
    }
    lista.append(artigo);
  }
}

async function abrir(destino) {
  tela = destino;
  const atual = ++carregamento;
  for (const secao of document.querySelectorAll('section')) secao.hidden = secao.id !== destino;
  for (const item of document.querySelectorAll('[data-tela]')) {
    if (item.dataset.tela === destino) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  if (destino === 'estoque') {
    const lista = await api('produtos');
    if (atual !== carregamento) return;
    produtos = lista;
    listarProdutos();
    margem();
  }
  if (destino === 'movimentos' || destino === 'compras') {
    const [lista, parceiros, resultado] = await Promise.all([
      api('produtos'), api('fornecedores'), api(destino === 'compras' ? 'pedidos' : 'movimentacoes')
    ]);
    if (atual !== carregamento) return;
    produtos = lista;
    if (destino === 'compras') mostrarPedidos(resultado, parceiros);
    else mostrarMovimentos(resultado, parceiros);
  }
  if (destino === 'fornecedores') {
    const lista = await api('fornecedores');
    if (atual === carregamento) mostrarFornecedores(lista);
  }
  if (destino === 'relatorio') {
    const total = await api('relatorio');
    if (atual !== carregamento) return;
    $('#totais').replaceChildren(
      indicador('Faturamento em vendas', moeda(total.faturamento)),
      indicador('Custo das entradas', moeda(total.compras)),
      indicador('Lucro bruto estimado', moeda(total.lucro)),
      indicador('Vendas sem custo informado', total.vendas_sem_custo));
  }
}

async function entrar() {
  usuario = await api('sessao');
  $('#identidade').textContent = usuario.nome + ' · ' + nomes[usuario.perfil];
  for (const item of document.querySelectorAll('[data-perfil]')) {
    item.hidden = item.dataset.perfil === 'admin' ? usuario.perfil !== 'administrador' : !gestao();
  }
  $('#login').hidden = true;
  $('#sistema').hidden = false;
  await abrir('estoque');
}

function margem() {
  const form = $('#produto');
  const custo = form.elements.custo;
  const preco = form.elements.preco;
  const resultado = $('#margem');
  const percentual = (preco.valueAsNumber - custo.valueAsNumber) / preco.valueAsNumber * 100;
  resultado.textContent = Number.isFinite(percentual) && preco.valueAsNumber > 0
    ? 'Margem de lucro ' + percentual.toFixed(2).replace('.', ',') + '%' : 'Margem de lucro —';
  resultado.classList.toggle('baixo', percentual < 10);
}

$('#produto').addEventListener('input', evento => {
  const form = $('#produto');
  const desejada = $('#margem-desejada');
  if ((evento.target === desejada || evento.target === form.elements.custo) &&
      desejada.value && desejada.checkValidity() && form.elements.custo.valueAsNumber >= 0) {
    const preco = form.elements.custo.valueAsNumber / (1 - desejada.valueAsNumber / 100);
    form.elements.preco.value = (Math.ceil(preco * 100) / 100).toFixed(2);
  }
  margem();
});
$('#busca').addEventListener('input', listarProdutos);
$('#ordem').addEventListener('change', listarProdutos);
$('#somente-baixo').addEventListener('change', listarProdutos);
$('#cancelar-edicao').addEventListener('click', () => editarProduto());
$('#movimento').elements.tipo.addEventListener('change', camposMovimento);
$('#fornecedor').elements.cnpj.addEventListener('input', evento => {
  evento.target.value = formatarCnpj(evento.target.value);
});
for (const item of document.querySelectorAll('[data-tela]')) {
  item.addEventListener('click', () => {
    aviso('');
    abrir(item.dataset.tela).catch(erro => aviso(erro.message, true));
  });
}
$('#sair').addEventListener('click', async () => {
  try {
    await api('sair', 'POST');
    mostrarLogin();
    aviso('');
  } catch (erro) {
    aviso(erro.message, true);
  }
});

formulario($('#login'), async dados => {
  await api('login', 'POST', dados);
  await entrar();
}, false);
formulario($('#produto'), async dados => {
  const resultado = produtoEmEdicao
    ? await api('produtos/' + produtoEmEdicao, 'PATCH', dados)
    : await api('produtos', 'POST', dados);
  editarProduto();
  return resultado;
});
formulario($('#movimento'), dados => api('movimentacoes', 'POST', dados));
formulario($('#fornecedor'), dados => api('fornecedores', 'POST', dados));
formulario($('#pedido'), dados => api('pedidos', 'POST', {
  ...dados, produtos: new FormData($('#pedido')).getAll('produtos')
}));
formulario($('#importar'), async () => {
  const arquivo = $('#importar input[type=file]').files[0];
  if (arquivo.size > 1000000) throw new Error('Selecione um CSV de até 1 MB.');
  return api('importar', 'POST', { csv: await arquivo.text() });
});

entrar().catch(erro => {
  if (erro.message !== 'Entre para continuar.') aviso(erro.message, true);
});

// Atualiza o painel quando outra sessão movimenta o estoque.
setInterval(async () => {
  if (!usuario || tela !== 'estoque' || document.hidden) return;
  const atual = carregamento;
  try {
    const lista = await api('produtos');
    if (atual === carregamento) {
      produtos = lista;
      listarProdutos();
    }
  } catch (erro) {
    if (atual === carregamento) aviso(erro.message, true);
  }
}, 10000);
