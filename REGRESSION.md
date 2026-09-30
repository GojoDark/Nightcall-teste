# Baseline e regressão — Nightcall

Baseline: NIGHTCALL-v0.10.1.zip, SHA256
`4C9610F5506B8E5E92B663B81AC70FC51237D3940697DAA0565A54A9FBC4EF9B`.
Inventário registrado antes das alterações. O ZIP original permanece intacto.

## Inventário da v0.10.1

- Aplicação existente: JavaScript no navegador, servidor Node HTTP, SQLite; sem dependências npm externas.
- Cadastro, login, sessão por cookie, amizades, DMs, mensagens de comunidade, convites e canais persistidos.
- Perfil público por accountId, avatar/banner por arquivo ou URL, bio/status/links; editor no perfil.
- Comunidades com nome/ícone, criação de canais, membros à direita e painel recolhível.
- Duas implementações de chamada: privada e comunidade; microfone/câmera/tela compartilhados em variáveis da interface.
- Presença em memória com heartbeat e expiração de 10 segundos. Reentrada sai e entra novamente.
- Signaling por polling de 700 ms; leitura remove toda a fila; erros podem perder eventos e ICE precoce.
- Vídeos da comunidade usam um elemento por pessoa: câmera/tela não são distinguíveis.
- Testar microfone para a track atual. Renderizações recriam vídeos e podem invalidar PiP.
- Somente STUN, sem configuração TURN.
- `npm test` e `npm run build` originais: PASSARAM. O teste original cobre senhas e tabelas, não mídia.

## Critérios de liberação automatizados

- [x] Smoke original, lifecycle, presença e signaling passam.
- [x] Join repetido preserva sessão e mídia; sair libera recursos.
- [x] ICE anterior ao SDP é preservado; ofertas simultâneas não travam negociação.
- [x] Eventos de outra sessão/canal não contaminam a chamada atual.
- [x] Câmera e tela são independentes; mute/deafen/volume permanecem ao navegar.
- [x] Presença exige entrada, deduplica, expira e sai imediatamente.
- [x] Cadastro, amigos, DM, comunidade, convite, perfil e canais mantêm contratos.
- [x] `npm test` e `npm run build` passam na versão final.

## Checklist manual — duas contas e duas redes

Executar em navegador compatível, HTTPS (ou localhost para teste local). Registrar navegador, rede, tempo até áudio e resultado. Esta lista não é evidência de execução.

1. Cadastro/login de A e B; pedido/aceite de amizade; DM nos dois sentidos.
2. Perfil acessível pelo Home, Amigos, DM e comunidade; editar nome/bio/status/links, avatar/banner por arquivo e URL; recarregar.
3. Criar comunidade, convite, entrar com B; ícone por arquivo e URL; nome longo legível; novos canais aparecem; membros à direita/recolhíveis.
4. Call privada: áudio bidirecional → mute → deafen → volumes individuais → navegar para chat/DM/perfil/configurações → voltar, sem nova captura nem perda de áudio.
5. A e B ligam câmera e tela simultaneamente; quatro vídeos distintos. Grade/Foco; parar apenas a tela preserva câmera e voz.
6. PiP nativo por tile local/remoto, câmera/tela; alternar aplicativo, navegar no Nightcall, fechar PiP e reabrir. Não interromper tracks.
7. Trocar entrada e saída; testar microfone durante a call; não interromper voz. Desconectar/reconectar rede e observar recuperação/erro visível.
8. Desligar; capturas e áudios remotos encerrados; outra conta sai da call.
9. Repetir 4–8 na comunidade; navegar para #geral sem perder áudio. Clicar no mesmo canal só reabre a interface.
10. B observa presença sem entrar. A entra uma única vez, sai e desaparece; fechar aba, perda de rede e nova entrada não criam fantasmas/duplicados.
11. Terceira conta: entrar após câmera/tela já ligadas, sair e entrar novamente; identidades e streams corretos.
12. Recusar chamada, negar permissões, cancelar compartilhamento, chamada ocupada, logout durante call.

Som, latência percebida, qualidade entre redes, seleção de dispositivos físicos e PiP fora do aplicativo exigem validação humana. Não declarar esses itens aprovados por testes com mocks.


## Etapa mobile v0.12.0-rc.1 — aprovação física pendente

Inventário desta etapa em MOBILE-BASELINE.md.

- [ ] PC A → celular B: primeira DM com conversa fechada; lista sobe e badge atualiza.
- [ ] Receber em Home, outra DM, comunidade e Configurações; Atender/Recusar globais.
- [ ] Aceitar, recusar, cancelar, deixar perder, encerrar; ambos sincronizam; histórico após reload e novo login.
- [ ] Repetir celular B → PC A, PC ↔ PC e celular ↔ celular com duas pessoas.
- [ ] Duas abas/dispositivos do destinatário: ambos recebem; apenas um aceita.
- [ ] Home, Amigos, DMs, comunidade, Perfil e Configurações em 320/360/390/412/768/1024/desktop; sem overflow.
- [ ] Menu de canais fecha ao selecionar; membros separado; Voltar Android/navegador retorna sem perder a call.
- [ ] Teclado virtual real aberto: composer visível; rascunho e rolagem ao navegar.
- [ ] Comunidade vazia, erro temporário, Tentar novamente, canais rápidos e alternância durante resposta lenta.
- [ ] Ler histórico e receber mensagem sem salto de rolagem; indicador leva ao final.
- [ ] Wi-Fi/dados, offline temporário, background e tela bloqueada; reconectar ou terminar com estado claro; sem mensagens duplicadas.
- [ ] Microfone/câmera/tela/áudio da tela simultâneos, mute/deafen/volume, Grade/Foco/Maximizar/Fullscreen e PiP fora do aplicativo.
- [ ] Notificações internas de DM, chamada recebida/perdida, amizade e convite; permissão de notificação e comportamento real em background.

Registrar aparelho, sistema, navegador, rede, latência até áudio, resultado e evidência de cada cenário. Nenhum item físico acima foi executado nesta sessão. Esta candidata não deve ser rotulada como versão final aprovada antes disso.

## Refatoração rc.2

- [x] Templates carregam após formatação; imports e imagens locais resolvem.
- [x] Cadastro/login/logout, sessão, amizade, DM e perfil pela interface.
- [x] Backend preservado byte a byte.
- [x] Formatação e busca básica de secrets.
- [ ] Repetir a checklist humana acima em dois dispositivos e duas redes.


## HTML rc.3

- [x] Estrutura fixa existe no documento mesmo sem JavaScript.
- [x] Nenhuma requisição a /templates/.
- [x] Elementos da shell/Home/call preservados após navegação e login/logout repetidos.
- [x] Suítes de autenticação, desktop e mobile repetidas após a migração.


## Root rc.4

- [x] Login visível em y=0, sem scroll/compensação, em desktop e mobile emulado.
- [x] Login/logout e refresh com/sem sessão preservam um único estado de viewport no #app.
- [x] Teste novo falha na rc.3 com y=912 e passa na rc.4.

