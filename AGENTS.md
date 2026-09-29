# Regras de manutenção do Nightcall

O código deve ser compreensível e editável por Victor e Gabrielly. Leia COLLABORATION.md antes de alterar a organização.

- Preserve o projeto existente e os comportamentos testados. Não faça reescrita total para organizar pastas.
- Prefira estrutura/conteúdo, visual e comportamento separados quando isso for compatível com a implementação atual. Não force o aplicativo a caber em três arquivos.
- Modularize apenas quando melhorar a compreensão, a edição ou os testes. Dê nomes que expliquem a função: friends, messages, profile, communities, calls. Evite arquivos genéricos ou sufixos de versões improvisados.
- Faça extrações incrementais, uma responsabilidade por vez. Atualize a seção “Onde eu mexo?” de COLLABORATION.md junto com cada mudança de responsabilidade ou caminho.
- Não duplique funções compartilhadas nem crie novos loops/listeners a cada navegação.
- Use comentários úteis, preferencialmente em português, para decisões importantes e lógica não óbvia. Não explique linha por linha o que já está claro.
- A sessão e as capturas pertencem ao CallManager global. Navegação não pode desmontar PeerConnection, microfone, câmera, tela ou áudio remoto. Preserve a coordenação de aceite/encerramento com o servidor.
- Preserve autorização no backend, isolamento das sessões, armazenamento seguro de senhas e dados existentes. Documente migrações e impactos antes de alterar contratos.
- Para mudanças funcionais, execute npm test e npm run build; execute regressão de navegador quando comunicação, navegação ou layout forem afetados. Diferencie mídia sintética de teste físico com pessoas e duas redes.
- Não publique externamente, conecte GitHub ou envie dados/credenciais sem instrução do usuário. Esta organização não autoriza publicação.

Segurança, funcionamento e manutenção têm prioridade sobre reduzir artificialmente o número de arquivos.

## Estrutura implementada na rc.3

Frontend: web/js por área, web/index.html para estrutura fixa e componentes dinâmicos, web/css para visual e web/assets para recursos. Não volte a concentrar telas em app.js; ele inicializa a sessão e os módulos. Preserve nomes de campos entre HTML e renderTemplate. Use esc() para dados fornecidos por usuários. Não substitua a shell nem as regiões fixas por strings de HTML. Após mover caminhos, rode também os testes de templates/imports e o roteiro de autenticação da interface.
