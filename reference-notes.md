# Referência ControleFii — observações de inspeção

A inspeção foi passiva, por listagem do pacote, sem executar o APK. O arquivo é um aplicativo Android nativo com recursos de launcher em múltiplas densidades e componentes AndroidX, indicando uma experiência móvel compacta e orientada a formulários. A implementação do FII Guard manterá uma hierarquia equivalente de consulta rápida, cadastro direto e feedback imediato, mas seguirá a base Expo/React Native do projeto.

Requisitos visuais derivados da referência e confirmados pelo pedido do usuário: formulário de operação como ação central; sugestão de ticker durante a digitação; preenchimento automático de informações do fundo; compra e venda no mesmo fluxo; PM, custo e posição recalculados enquanto os campos mudam; navegação simples para carteira, proventos e resultados; e interface sem associação visual a um único fundo.

A automação será transparente: a busca de sugestões usa um catálogo local de tickers para resposta imediata; os dados do ticker escolhido podem ser enriquecidos pela fonte de mercado; e os valores da operação são apenas uma simulação até o usuário tocar em Salvar.

## Revisão visual da rodada

O dashboard redesenhado agora apresenta hierarquia financeira clara: cartão escuro de patrimônio, indicadores de apoio, duas rosquinhas com estado vazio explícito, ações rápidas e posições. A captura desktop confirmou bom contraste e ausência dos grandes blocos brancos sem propósito da versão anterior. A captura em viewport estreita confirmou que o cabeçalho e o seletor Compra/Venda permanecem legíveis; os campos continuam em coluna única para uso com uma mão. A tela precisa ser retestada com dados reais cadastrados para validar a rotação dos segmentos das rosquinhas e a prévia do PM preenchida.

## Revisão de formatos em tela

A aba Proventos renderiza o histórico, gráfico, total mensal, acumulado anual e cabeçalho de tabela. Em tela de 390 px, o cabeçalho fica compacto, portanto os campos foram dimensionados para preservar os principais valores. A tela Nova movimentação ainda mostrou AAAA-MM-DD no campo de data e texto antigo de ajuda, indicando que a alteração do formulário não persistiu no bundle atual; esse ponto deve ser corrigido e validado novamente.

## Validação final de data, moeda e proventos

Os formulários agora exibem a data inicial como 01/09/2026, ajudam com DD/MM/AAAA e informam a conversão de 7295 para 72,95. O cadastro de provento usa o mesmo padrão. A aba Proventos mostra gráfico de seis meses, total no mês, acumulado no ano e tabela compacta com Dt.Pgto., Ativo, Tipo, Qtde., Vl.unit. e Total; o estado vazio permanece legível e oferece cadastro.

## Última revisão visual

A tela Nova movimentação confirmou o formato 01/09/2026 e a instrução de entrada em centavos. A tela Proventos confirma o gráfico acima dos totais mensal/anual e o cabeçalho compacto da tabela para o formato mobile. Não foram observadas sobreposições ou texto cortado no viewport de 390 px.
