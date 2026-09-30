# Correção de layout — v0.12.0-rc.4

## Causa raiz

Na rc.3, #app envolvia apenas o boot. O login e a shell foram inseridos como irmãos posteriores. A regra existente de altura de 100% mantinha o root vazio ocupando uma viewport, mesmo depois de ocultar o boot. O login começava abaixo dele (y=912 numa viewport de 912 px). O 401 de /api/auth/me era o resultado normal sem sessão.

Os testes anteriores usavam visibilidade CSS e interações do navegador, sem exigir que o formulário estivesse dentro da viewport inicial. Isso permitiu que o defeito passasse.

## Correção delimitada

Boot, auth-page e app-shell agora são filhos do mesmo #app. O estado existente alterna hidden entre boot/login/shell; o root deixa de ser um bloco vazio antes do login. Os overlays permanecem fora do root. A estrutura estática e os templates nativos da rc.3 foram preservados.

Nenhuma alteração em CSS, CSP, backend, protocolo ou módulos JavaScript funcionais: todos foram comparados byte a byte com a rc.3. Não foi adicionado unsafe-eval ou qualquer compensação por margem/transform/overflow. Sem push ou deploy.

## Teste que reproduz e protege a correção

npm run test:auth-layout. Em 1440×912 e 390×844, mede getBoundingClientRect, verifica o formulário dentro da viewport, um único estado ativo no root e ausência de duas alturas empilhadas. Exercita usuário deslogado, refresh deslogado, login, refresh autenticado, logout e refresh após logout. Confirma zero requisições /templates/ e zero erros JavaScript.

O mesmo teste foi executado contra o servidor da rc.3 e falhou com “logged out: top=912”. Na rc.4 passou com top=0 em todos os estados nas duas dimensões. A suíte existente também foi repetida; resultados e logs em TEST-RESULTS.md e test-evidence/.
