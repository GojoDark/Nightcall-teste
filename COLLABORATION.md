# Nightcall — Victor e Gabrielly

A modularização da rc.2 foi preservada; na rc.3 a estrutura estática foi migrada para web/index.html. O mapa abaixo aponta para os arquivos reais. Simples primeiro: um módulo corresponde a uma área do aplicativo, sem framework novo.

## Onde eu mexo?

| Quero mudar… | Abra |
|---|---|
| Cores, fontes, espaçamentos e aparência geral | [web/css/style.css](web/css/style.css) |
| Celular, tablet, menu lateral e responsividade | [web/css/responsive.css](web/css/responsive.css) |
| Aparência de chamadas, vídeos e controles | [web/css/calls.css](web/css/calls.css) |
| Título da aba e estrutura inicial | [web/index.html](web/index.html) |
| Texto e estrutura da Home | [web/index.html](web/index.html) |
| Atalhos e comportamento da Home | [web/js/home.js](web/js/home.js) |
| Tela de login/cadastro | [web/index.html](web/index.html) e [web/js/auth.js](web/js/auth.js) |
| Amigos, pedidos e aceite/recusa | [web/index.html](web/index.html) e [web/js/friends.js](web/js/friends.js) |
| DMs, envio, lista, leitura, rascunho e rolagem | [web/index.html](web/index.html) e [web/js/messages.js](web/js/messages.js) |
| Perfil público, edição, avatar e banner | [web/index.html](web/index.html) e [web/js/profile.js](web/js/profile.js) |
| Comunidades, canais, membros e convites | [web/index.html](web/index.html) e [web/js/communities.js](web/js/communities.js) |
| Preferências de microfone/saída e conta | [web/index.html](web/index.html) e [web/js/settings.js](web/js/settings.js) |
| Chamadas e ligação com o aplicativo | [web/js/calls.js](web/js/calls.js) |
| Microfone, câmera, tela e WebRTC | [web/js/call-manager.js](web/js/call-manager.js) |
| Receber/aceitar/recusar/desligar chamada privada | [web/js/private-calls.js](web/js/private-calls.js) |
| Painel da chamada, Grade/Foco, fullscreen e PiP | [web/index.html](web/index.html) e [web/js/call-view.js](web/js/call-view.js) |
| Menu, cabeçalho mobile e botão Voltar | [web/index.html](web/index.html) e [web/js/navigation.js](web/js/navigation.js) |
| Notificações internas | [web/index.html](web/index.html) e [web/js/notifications.js](web/js/notifications.js) |
| Atualizações periódicas de dados | [web/js/synchronization.js](web/js/synchronization.js) |
| Estrutura lateral, avatar, logo e erro de página | [web/index.html](web/index.html) |
| Escape de texto, API, imagens e componentes dinâmicos compartilhados | [web/js/ui.js](web/js/ui.js) |
| Imagens usadas pela interface | [web/assets/images/](web/assets/images/) |
| Ícones SVG compartilhados | [web/assets/icons.js](web/assets/icons.js) |
| Inicialização e encerramento da sessão | [web/js/app.js](web/js/app.js) |
| Rotas da API e autorização | [server/index.js](server/index.js) |
| Senhas e sessão do servidor | [server/auth.js](server/auth.js) |
| Estrutura do banco | [server/db.js](server/db.js) |
| Mensagens, chamadas, leitura e migrações | [server/conversations.js](server/conversations.js) |
| Entrada/saída e presença de voz | [server/voice-presence.js](server/voice-presence.js) |

O index.html da raiz continua sendo apenas a página que explica como iniciar o servidor. A aplicação usa web/index.html e os templates nativos no próprio documento. Não editem dist/: ela é uma cópia gerada pelo build.

## Um exemplo completo

Para alterar a seção de conversas da Home, abram web/index.html. Ali estão os textos, classes e estrutura. Para mudar a ação ao clicar, abram web/js/home.js. Para mudar a cor ou tamanho, abram web/css/style.css; se a mudança for específica do celular, web/css/responsive.css.

As regiões fixas existem diretamente no documento e são reutilizadas. Comentários field:nome/end-field delimitam apenas dados dinâmicos; não apague esses delimitadores ao editar a estrutura. Componentes repetidos usam elementos template nativos com identificadores. Campos como {{displayName}}, {{onlinePeople}} e {{recentConversations}} são preenchidos pelo módulo JavaScript correspondente. Mantenham os nomes dos campos iguais nos dois arquivos. Usem esc() ao acrescentar texto fornecido pelo usuário; não coloquem dados sem escape dentro de HTML. Não há eval nem execução de expressões dentro dos templates.

O CSS é carregado em ordem: style.css → calls.css → responsive.css. Uma regra posterior pode sobrescrever a anterior. URLs de avatares/banners são dados dinâmicos preenchidos pelo JavaScript; cores, medidas e layout ficam no CSS.

## Como os módulos conversam

app.js cria três objetos para uma sessão autenticada:

- state: usuário, página selecionada, amigos, conversas e outros dados compartilhados.
- services: os objetos que precisam continuar vivos, como a chamada, o chat, a navegação e o scheduler.
- actions: as funções das áreas, registradas na inicialização. Por exemplo, um botão da Home chama actions.startDm(), implementada em messages.js.

Cada arquivo exporta suas ações através de uma função create…. Não copiem lógica entre telas. Ao referenciar uma ação que ainda não foi registrada durante a inicialização, usem um callback que a consulte quando o usuário clicar.

## Onde é preciso entender o impacto

- CallManager é o dono dos peers e streams. Navegação pode esconder a UI, mas não parar capturas ou criar outro manager. calls.js faz a integração; private-calls.js coordena aceite e desligamento com o servidor.
- A ordem de microfone/câmera/tela/áudio da tela identifica os transmissores WebRTC. Não mudem essa ordem ou os IDs de sessão sem ler ARCHITECTURE.md e testar ambos os lados.
- Presença de voz exige entrada explícita. Heartbeat renova uma entrada; não cria participantes.
- Autorizações ficam no servidor. Esconder botões não substitui conferir quem pode executar uma ação.
- Migrações precisam preservar contas, amizades, mensagens e histórico. Façam backup antes de mexer no banco.
- Senhas continuam com hash. Nunca coloquem credenciais reais no código, no .env.example ou em commits.
- Usem o scheduler compartilhado; não criem polling novo a cada página.

## Trabalhando juntos

Sigam [GITHUB-DESKTOP.md](GITHUB-DESKTOP.md) para instalação, clone, branches, commits, pull/push e conflitos. O repositório informado é GojoDark/Nightcall; estava vazio na verificação da rc.2. Os commits locais anteriores são da rc.2; esta rc.3 é entregue no ZIP, sem push ou novos commits.

Combinem uma área por mudança. Usem nomes que expliquem o objetivo, sem misc.js, utils2.js ou app-final2.js. Extrações futuras devem ter um benefício concreto, preservar comportamento e atualizar este mapa.

Comentários devem explicar decisões importantes, principalmente sessão, mídia, permissões e requisições concorrentes. Evitem comentar o óbvio linha por linha. Segurança e funcionamento têm prioridade sobre reduzir artificialmente o número de arquivos.

Para alterações funcionais, rodem npm test e npm run build. Para interface, também npm run test:auth; para chamadas, npm run test:browser; para navegação/layout, npm run test:mobile. Consultem o README sobre o navegador de teste e REGRESSION.md sobre os testes físicos pendentes.

Na rc.4, web/index.html declara boot, auth-page e app-shell dentro do mesmo #app. Ao editar essa estrutura, rode npm run test:auth-layout: os estados precisam ocupar a mesma viewport, sem empilhamento.
