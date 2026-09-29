# rc.3: migração delimitada da rc.2

## Inventário antes da alteração

Estruturais: ui.shell-app-shell, auth.page, navigation.mobile-header, home.home-home-page, friends.friends-friends-page, messages.messages-messages-page, messages.chat, profile.open-user-profile-profile-page, profile.profile-profile-page, settings.settings-settings-page, call-view.panel, notifications.show-notifications-content e communities.space-modal-space-modal.

Dinâmicos/reutilizáveis: avatars, cards, listas/linhas de amigos e conversas, mensagens/eventos de chamada, links, opções de dispositivos, campos alternativos de cadastro/login, cabeçalhos específicos de conversa/comunidade, tiles de vídeo e diálogos parametrizados de convite/configuração de comunidade.

## Implementação

Os estruturais foram declarados como elementos reais em web/index.html. As sete regiões de página são reaproveitadas por referência; não ficam em um Map de strings. O painel de chamada, o banner de convite, as notificações e o modal de criar/entrar em comunidade permanecem no documento e alternam hidden. O teste sem JavaScript confirma a presença dessa estrutura antes da execução de app.js.

Os componentes dinâmicos continuam em elementos template nativos, no mesmo HTML. Os 11 arquivos antigos foram removidos e nenhuma requisição /templates/ é feita. renderTemplate preenche somente esses componentes; fillFields altera apenas os dados entre comentários, preservando os elementos estruturais. Não foi adicionado framework. Os módulos JavaScript mantêm seus nomes/responsabilidades.

Os seis arquivos server/ e web/js/call-manager.js foram comparados byte a byte com a rc.2 e não mudaram. Os ajustes em private-calls.js e call-view.js apenas vinculam/limpam as regiões permanentes, preservando o protocolo e a mídia.

## Verificação

Veja TEST-RESULTS.md e test-evidence/. O teste desktop foi ajustado para aguardar modais invisíveis em vez da remoção de todos os backdrops, pois agora existe um backdrop permanente oculto. As asserções funcionais de chamadas foram mantidas. A rc.2 original foi preservada. Não houve push, deploy ou nova refatoração geral.
