# Design de Interface — FII Guard

## Direção

O aplicativo será vertical, otimizado para uso com uma mão e inspirado nos padrões de aplicativos financeiros nativos. A marca exibida no launcher será **GARE 11**, conforme solicitado pelo usuário. Os dados da carteira serão locais; a atualização de mercado ocorrerá na abertura ou por ação manual.

## Telas

| Tela | Conteúdo e ações |
| --- | --- |
| Início | Valor de mercado, custo investido, resultado, proventos do mês, posições principais, atualizar e lançar operação |
| Carteira | Busca, lista de FIIs, quantidade, preço médio, cotação, valor de mercado e resultado |
| Detalhe do FII | Posição, PM, cotação, histórico de compras, vendas e proventos, editar e excluir |
| Nova movimentação | Compra/venda, ticker, data, quantidade, preço, taxas e observação |
| Proventos | Rendimentos e amortizações, total por período, cadastro, edição e exclusão |
| Resultados | Relatório mensal e anual com aportes, vendas, proventos, resultado realizado e resultado em aberto |
| Ajustes | Endereço do serviço Python/yfinance, atualização manual, exportação e restauração de backup |

## Regras de cálculo

Compras recalculam o PM pela soma do custo aberto, valor da compra e taxas dividida pela quantidade total. Vendas reduzem a quantidade sem alterar o PM remanescente e reconhecem o resultado realizado pelo PM vigente. Proventos são calculados pela quantidade disponível na data-com. Relatórios usam as datas dos lançamentos e mudam de mês e ano automaticamente.

## Fluxos

O usuário abre o app, que tenta sincronizar os tickers ativos se houver endereço configurado. Para registrar, toca no botão de adicionar, escolhe compra ou venda, preenche os dados e salva. Para acompanhar renda, abre Proventos, revisa os eventos importados ou cadastra manualmente. Para segurança, Ajustes permite exportar JSON e restaurar um backup após confirmação.

## Cores

A interface usa azul ardósia da marca GARE 11 como cor primária, branco nos cartões, fundo marfim, grafite para números, verde para resultados positivos, âmbar para dados pendentes e vermelho para perdas/erros.
