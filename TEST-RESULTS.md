# Resultados — v0.12.0-rc.4

29/09/2026. Windows, Node 24.19.0, npm 11.17.0, Chrome 153.0.8010.53 headless. Sem publicação, túnel externo ou TURN provisionado.

## Execução final

| Verificação | Resultado |
|---|---|
| npm test | PASS: smoke original + 19 testes, zero falhas |
| npm run format:check | PASS: JavaScript, CSS, templates e HTML |
| npm run check:project | PASS: busca básica de padrões conhecidos de secrets; não é auditoria de segurança |
| tests/auth-ui.mjs | PASS: cadastro, sessão, amizade, DM, perfil, notificações, logout e login pela interface |
| npm run test:auth-layout | PASS: desktop/mobile, login/logout, refresh com/sem sessão, y=0, um único estado no root |
| npm run test:structure | PASS: estrutura sem JS, zero fetch de templates, identidade preservada e login/logout repetidos |
| npm run build | PASS: sintaxe de servidor/interface e geração de dist |
| tests/browser.mjs | PASS: duas contas isoladas, WebRTC real local, mídia sintética |
| tests/mobile.mjs | PASS: desktop↔mobile emulado, dois mobiles emulados, múltiplos clientes e matriz de layout |

Os logs integrais e capturas estão em test-evidence. Os scripts podem ser repetidos com npm run test:browser e npm run test:mobile, usando Playwright/Chromium disponíveis e as variáveis descritas no README. --disable-gpu foi usado somente no Chrome de teste para evitar que a câmera sintética encerrasse; não muda o navegador do usuário.

## Cobertura executada

- Auth, amigos, perfis, upload/URL, DMs, comunidade, convites, canais, presença, autorização de signaling e isolamento de sessões.
- Backend de chamadas: criação idempotente, ocupado, todos os clientes, um aceite vencedor, recusa/cancelamento/perdida/término, cronômetro após confirmação dos dois lados, histórico após reload/login, leitura e não lidas.
- Encerramento local com confirmação lenta: snapshot antigo não reinicia captura. Reentrada, permissão pendente, falha de troca de mídia e limpeza de tracks.
- DMs reordenadas por atividade, convite interno entregue, envio idempotente, últimas 300 mensagens de canal sem congelar na primeira página.
- Chamada privada e de comunidade: áudio Opus, microfone e áudio compartilhado separados com pacotes recebidos, câmera+tela de ambos com frames decodificados, navegação e perfil sem perder a sessão, mute/deafen, volumes, reinício ICE e saída/reentrada de participante.
- Grade/Foco, maximizar, fullscreen e API de PiP nativo. PiP permaneceu ativo ao minimizar e reverteu sem destruir o vídeo.
- PC→mobile emulado: banner em comunidade, aceite/conexão, chat com call ativa, término e histórico após reload. Fluxos inversos de recusa/cancelamento e chamada entre dois mobiles emulados. Duas instâncias do destinatário recebem e apenas uma atende.
- Comunidade: erro 503 simulado, retry e estado vazio. DM recebida fechada atualiza Home/lista/badge. Perda temporária de rede: erro visível, texto mantido e envio único após reconexão.
- Rascunho e posição de leitura preservados; nova mensagem não arrasta o histórico e exibe indicador.
- Home, DM com URL longa, comunidade, Amigos, Perfil e Configurações: 320, 360, 390, 412, 768, 1024 e 1440 px, sem elementos visíveis ultrapassando a largura. Composer contido em viewport reduzido de 390×480. Voltar do navegador testado.
- Nenhum pageerror nos dois testes finais de navegador.

## Não executado — exige validação física

Não houve duas pessoas falando, celulares físicos, duas redes, avaliação de latência/eco/qualidade, troca de dispositivos reais, bloqueio de tela, Wi-Fi↔dados, Safari/iOS/Firefox, seletor real de compartilhamento ou PiP visível fora do Nightcall. Reduzir viewport não reproduz integralmente teclado virtual real. O áudio da tela no teste foi um oscilador sintético; a fonte real depende do navegador.

Notificações de navegador/PWA estão preparadas, mas entrega com aplicativo fechado não está implementada: falta infraestrutura Web Push. A suspensão prolongada de uma aba móvel pode terminar a chamada após expiração, exigindo nova entrada. Histórico anterior às 300 mensagens recentes não tem paginação nesta etapa. Nenhuma promessa de zero regressões em dispositivos não testados.

**Status: candidata para testes físicos; a etapa ainda não está aprovada como versão final.** Use REGRESSION.md para registrar os cenários humanos pedidos.

## Migração HTML sobre rc.2

Backend (seis arquivos) e CallManager idênticos byte a byte à rc.2. A suíte completa acima foi executada após a migração. O teste de templates foi adaptado ao documento nativo; o teste desktop aguarda fechamento visual dos modais, inclusive os permanentes. Corrigidos durante a execução: normalização dos atributos pelo parser HTML, chamada antiga do template do editor de perfil e estados visuais persistentes entre sessões. Nenhuma alteração de protocolo ou banco. Sem push/deploy. Capturas desktop/mobile revisadas visualmente.

## Correção do root na rc.4

O teste de layout reproduziu o defeito na rc.3 (top=912) e passou na rc.4 (top=0) em 1440×912 e 390×844. O formulário está integralmente dentro da viewport. Login, logout, refresh autenticado e deslogado não empilham duas regiões de altura integral. Nenhuma requisição a /templates/. Backend, CSS e todos os módulos web/js idênticos byte a byte à rc.3; CSP preservada sem unsafe-eval. A suíte existente foi repetida. Causa raiz em ROOT-LAYOUT-FIX.md.
