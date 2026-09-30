# NIGHTCALL v0.12.0-rc.4 — candidata para validação física

Continuação da v0.11.0, derivada do ZIP v0.10.1. Mantém servidor Node, SQLite, contas, amizades, DMs, comunidades, canais e perfis existentes. Esta etapa parte exclusivamente da rc.2: a estrutura fixa agora está em web/index.html, com templates nativos para componentes dinâmicos no mesmo documento. Preserva CSS em web/css, módulos em web/js e imagens em web/assets. Não há carregamento de HTML por fetch. Os testes automatizados passaram; PC/celular físicos, duas redes e avaliação humana ainda estão pendentes. Esta candidata não é uma aprovação desses cenários.

## Abrir localmente

**Victor e Gabrielly: para editar o projeto, comecem pelo [COLLABORATION.md — Onde eu mexo?](COLLABORATION.md#onde-eu-mexo).** Ele aponta os arquivos e funções reais e explica como simplificar a organização sem perder comportamentos.

1. Extraia todo o ZIP para uma pasta nova.
2. Use Node.js 24 ou superior (validado com 24.19.0). Para desenvolvimento, execute `npm ci` para instalar o formatador fixado no lockfile.
3. Para manter seus dados, encerre o servidor antigo e copie sua pasta `data` para a pasta nova. Guarde uma cópia de segurança. A rc.3 não altera schema nem protocolo da rc.2; versões anteriores podem exigir as migrações já existentes. Para voltar à versão anterior, use também o backup anterior do banco. O ZIP não contém contas ou banco de testes.
4. Abra `ABRIR-NIGHTCALL.bat`, ou execute `npm start` nessa pasta.
5. Acesse `http://localhost:3000`. Não há dependências npm para iniciar o servidor.

Reinicie o servidor e recarregue as abas das duas pessoas após atualizar. O protocolo de chamadas exige que os dois lados usem esta versão.

## Chamadas

- A mesma sessão continua ao navegar pelo aplicativo. Use **Minimizar** e **Voltar à call** para alternar entre chamada e páginas. Clicar novamente no mesmo canal reabre a sessão.
- O servidor permite uma chamada privada ativa por conta e entrega o convite a todos os clientes ativos. O primeiro aceite escolhe o dispositivo de mídia. Atender/Recusar é global; cancelar e encerrar sincronizam os dois lados. O cronômetro começa após ambos confirmarem conexão. O histórico fica na DM.
- Uma sessão de mídia por aba. Para mudar para outra call, encerre a atual. A presença de comunidade impede entradas simultâneas da mesma conta em outras abas.
- Microfone e áudio também podem ser controlados pelo dock. Deafen silencia envio e recepção e preserva o mute anterior ao reativar.
- Cada participante tem volume individual. Configurações permite escolher entrada/saída e processamento de áudio; seleção de saída depende do navegador.
- Câmera e tela têm tracks e tiles separados. O áudio da tela, quando oferecido pelo navegador e selecionado pelo usuário, usa uma track adicional. Grade, Foco, Maximizar e Tela cheia funcionam nos dois tipos de call.
- O botão PiP de cada tile abre o Picture-in-Picture nativo quando o vídeo está reproduzindo e o navegador oferece suporte. Minimizar mantém o mesmo elemento de vídeo.
- **Ativar áudio** retoma a reprodução quando o navegador bloqueia autoplay.

## Testes

```text
npm test
npm run build
```

Os testes usam bancos temporários. O build verifica a sintaxe e gera `dist` com servidor e interface.

Testes de navegador: `npm run test:browser` e `npm run test:mobile`. Requer Playwright e Chromium disponíveis. Aceita `PLAYWRIGHT_MODULE` (caminho/URL do módulo) e `CHROME_PATH` (executável). Usa duas contas isoladas, microfone/câmera sintéticos do Chromium e tela sintética de canvas. Capturas ficam em `test-results`.

No celular, o menu abre comunidades/canais/atalhos e o botão Membros abre o painel à direita. Voltar usa o histórico do navegador. Conversas mantêm rascunho e posição de leitura na sessão da aba.

Notificações internas estão disponíveis no sino/menu. A permissão do navegador é opcional e depende de HTTPS/suporte. O manifest e service worker preparam PWA, mas não há servidor Web Push: com o aplicativo fechado ou suspenso não há garantia de entrega.

Consulte `REGRESSION.md`, `TEST-RESULTS.md`, `CHANGELOG.md` e `ARCHITECTURE.md`.

## Redes diferentes e TURN

Nenhum serviço foi publicado. Os iniciadores online anteriores foram preservados, mas não executados.

Fora de localhost, captura de mídia requer HTTPS. Conexão direta via STUN pode falhar em determinados NATs/firewalls. Para usar um TURN próprio:

```powershell
$env:NIGHTCALL_TURN_URL='turn:seu-host:3478,turns:seu-host:5349'
$env:NIGHTCALL_TURN_USERNAME='seu-usuario'
$env:NIGHTCALL_TURN_PASSWORD='sua-senha'
npm start
```

Nenhum TURN foi provisionado ou testado nesta entrega. As credenciais são fornecidas aos clientes autenticados para WebRTC; use credenciais adequadas ao seu ambiente de teste.

Sair remove presença imediatamente. Uma aba que desaparece sem aviso expira após 30 segundos sem heartbeat. Reinício do servidor ou expiração exige entrar novamente. Falhas de transporte WebRTC disparam reinício ICE preservando as tracks.

## Código e colaboração

Leia [COLLABORATION.md](COLLABORATION.md), [GITHUB-DESKTOP.md](GITHUB-DESKTOP.md) e [REFACTOR-REPORT.md](REFACTOR-REPORT.md). `npm start` aceita `.env` opcional; use `.env.example` como modelo. O backend e o formato do banco não mudaram nesta refatoração.

`npm run test:auth` cobre cadastro/login/logout e ações sociais pela interface. Os três testes de navegador usam Playwright/Chromium; para instalá-los em ambiente de desenvolvimento, use `npm install --no-save --package-lock=false playwright` e `npx playwright install chromium`, ou configure PLAYWRIGHT_MODULE/CHROME_PATH para uma instalação já existente. Não é necessário instalar Playwright para executar o servidor ou `npm test`.

Teste adicional: `npm run test:structure` verifica estrutura sem JavaScript, ausência de requisições de templates e reutilização dos elementos entre navegações/logins. Usa o mesmo Playwright/Chrome dos demais testes de navegador.

Na rc.4, boot, login e shell são filhos do mesmo #app. Consulte ROOT-LAYOUT-FIX.md. Execute npm run test:auth-layout para verificar login/logout/refresh e posição na viewport.
