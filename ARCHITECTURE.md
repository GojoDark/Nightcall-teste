# Arquitetura — v0.12.0-rc.2

## Responsabilidades

- web/js/app.js inicializa os módulos das páginas e um estado comum de usuário, amigos, DMs, comunidades, mensagens, notificações e presença.
- web/js/synchronization.js possui um scheduler; cada job tem trava de execução. Trocar página não cria loops. Logout remove listeners e jobs.
- web/js/navigation.js mantém histórico e drawers. VisualViewport ajusta a altura útil quando o navegador expõe mudanças do teclado.
- web/js/messages.js mantém nós por ID, cache, rascunho, rolagem, loading/empty/error e geração de requisições; uma resposta atrasada não escreve na nova página.
- web/js/private-calls.js exibe convites globais e coordena aceite com o servidor. A mídia só começa depois de aceitar.
- web/js/call-manager.js possui microfone, câmera, tela, peers, volumes e áudio remoto; web/js/call-view.js possui tiles persistentes fora das páginas.
- server/conversations.js migra o banco de forma aditiva e administra DMs, leitura, idempotência, eventos e chamadas privadas.

## Contratos de chamada

O servidor gera callId e sessionIds. Todos os clientes autenticados do destinatário veem a chamada em /api/sync. Um aceite escolhe callee_client e callee_session. A execução síncrona da transição no processo Node impede dois vencedores. Operações seguintes validam conta e cliente; RTC valida contexto e sessions. IDs antigos não substituem o peer aceito.

calling → ringing → connecting → connected. Decline, cancel, timeout, end e fail geram terminais persistidos na conversa. O início e o término criam eventos únicos. connected_ms só é gravado após ambos reportarem conexão. Timeout de toque: 45 s; conexão: 45 s; lease privada: 60 s. Ausência prolongada do transporte encerra de forma explícita. O fluxo de comunidade mantém join/heartbeat/leave com lease de 30 s e não cria presença por heartbeat.

## Mídia e transporte

Quatro transceivers fixos: microfone, câmera, vídeo da tela e áudio da tela. O menor accountId oferece; o outro adota. SDP/ICE serializados, ICE antecipado enfileirado e colisões tratadas por perfect negotiation. Estado de mídia versionado acompanha SDP/heartbeat. replaceTrack preserva peers; rollback mantém mídia anterior quando a troca falha.

Polling central: sync a cada 300 ms após resposta (scheduler 200 ms), heartbeat 2,5 s, chat 2 s, metadados de comunidade 1,8 s e diretórios 4 s. Jobs iguais não se sobrepõem. Eventos usam cursor SQLite e signaling usa cursor em memória, até 100 eventos/conta por 60 s. Bootstrap limita eventos recentes a 200. Esse desenho continua para grupos pequenos e processo único, sem SFU.

Mensagens persistem no SQLite; a interface busca até 300 mensagens recentes por conversa/canal. Não há paginação de histórico anterior nesta etapa. Cache/drafts são da sessão da aba. Notificações internas derivam dos eventos; service worker não armazena dados privados em cache. Push com aplicativo fechado exige infraestrutura adicional e não foi provisionado.

## Referências e limitações

- [Perfect negotiation — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).
- [getDisplayMedia — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia): áudio depende da fonte, da escolha e do suporte do navegador.
- [VisualViewport — MDN](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport): ajuste do espaço visível depende do navegador.

Browser móvel pode suspender JavaScript e captura ao bloquear a tela. ICE restart não garante recuperação após suspensão longa ou troca de NAT; TURN deve ser configurado para avaliar duas redes. Reinício do servidor perde presença de voz em memória. As limitações estão na checklist física, sem alegação de aprovação.

## Separação do frontend

Os módulos por área recebem state (dados), services (instâncias persistentes) e actions (ações das áreas). app.js monta essas instâncias uma vez por login. Nenhuma factory cria uma segunda sessão de mídia ao trocar de página. A estrutura fixa é analisada pelo navegador ao abrir web/index.html. initializeDocument guarda referências aos elementos de páginas; showPage move esses elementos para a região principal, sem gerar outra shell. fillFields atualiza somente os campos delimitados por comentários. renderTemplate fica restrito aos componentes dinâmicos em templates nativos do documento. Não há fetch de templates, Map de marcação, eval ou framework novo.
