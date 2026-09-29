# Inventário antes da alteração — 29/09/2026

Base: v0.11.0 existente. O ZIP entregue e a pasta de trabalho anterior serão preservados.

Responsáveis encontrados:
- `web/app.js`: listas sociais, renderização de páginas, navegação, integração de chamadas e vários timers independentes.
- `web/call-manager.js`: tracks, peers, ICE, mute/deafen, volumes e presença de voz. Deve permanecer fora das páginas.
- `web/call-view.js`: tiles persistentes, PiP e controles de mídia.
- `server/index.js`: API HTTP, filas de signaling em memória e rotas sociais.
- `server/db.js`: SQLite, mensagens e associações; ainda sem chamadas persistidas ou contador de leitura.

Falhas identificadas no código:
- Chamada recebida usa `confirm()` bloqueante; não há sessão autoritativa no backend, histórico ou arbitragem entre abas.
- DMs são carregadas na inicialização e em ações da própria aba, não quando chega atividade de outro usuário.
- Chat da comunidade inicia `sig=''` e, se a resposta vazia chega pelo polling, pode retornar antes de substituir o loading; erros são silenciados por `catch{}`. Requisições não têm timeout e não há proteção contra resposta de uma navegação anterior.
- Navegação não possui histórico/voltar. CSS final mantém colunas desktop fixas em telas pequenas.
- Rerenderizações sociais podem substituir conteúdo e não existe um cache global de mensagens.

Critérios de regressão: manter testes v0.11, acrescentar estado de call no backend, múltiplos clientes, aceite/recusa/cancelamento/perdida, histórico após reload, DM recebida fechada, idempotência de envio, loading vazio/erro/retry, navegação para trás e viewport 320/360/390/412/768/1024/desktop.

Entrega será uma candidata enquanto os testes físicos PC↔celular e celular↔celular exigidos pelo usuário não forem realizados. Emulação e mídia sintética não serão apresentados como teste com pessoas ou celulares reais.
