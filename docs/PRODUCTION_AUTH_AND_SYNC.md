# Configuração de autenticação e sincronização

O projeto mantém o Convex como armazenamento dos dados financeiros. O modo atual, Convex Auth/Freebuff, continua como padrão. O modo escolhido no build do frontend vem de `VITE_AUTH_PROVIDER` (`firebase` ou `convex`); quando a configuração pública Firebase está pronta, a tela também permite alternar temporariamente entre os dois modos. Não coloque senhas, chaves privadas ou segredos em arquivos versionados, no chat ou em variáveis públicas `VITE_*`.

## Configurar Firebase Auth para Web

No Firebase Console, mantenha ativos os provedores **E-mail/senha** e **Google** e autorize o domínio publicado do site em Authentication → Configurações → Domínios autorizados. Em Configurações do projeto → Seus apps → app Web, copie as propriedades da configuração do SDK para as variáveis de frontend: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` e `VITE_FIREBASE_APP_ID`.

Esses quatro valores são a configuração pública do app Web Firebase; eles não são a chave de conta de serviço. Nunca copie uma chave JSON privada de conta de serviço para o navegador, para uma variável `VITE_*` ou para o repositório. No painel Vercel, cadastre as quatro variáveis para o ambiente Preview primeiro. Para definir o formulário Firebase como padrão no Preview, configure `VITE_AUTH_PROVIDER` como `firebase`. Se não estiver configurado, Convex Auth/Freebuff continua como padrão.

O login por e-mail e senha envia links de confirmação e recuperação usando o próprio Firebase. O login Google usa a janela oficial do Google. O app exige e-mail confirmado antes de permitir consultas e gravações financeiras.

## Configurar Convex para aceitar tokens Firebase — somente em ambiente de teste

O arquivo `src/convex/auth.config.ts` lê `FIREBASE_PROJECT_ID` quando as funções Convex são publicadas. O script atual da Vercel **não publica funções Convex em Preview**: ele apenas compila o frontend. Por isso, o primeiro teste precisa de um deployment Convex não produtivo preparado separadamente, com `FIREBASE_PROJECT_ID` disponível ao comando Convex que publicar esse backend, e o `VITE_CONVEX_URL` do Preview apontando para esse mesmo deployment de teste.

Não configure `FIREBASE_PROJECT_ID` nem `VITE_AUTH_PROVIDER=firebase` no ambiente Production nesta etapa. A publicação Production da Vercel executa `npx convex deploy`; qualquer alteração nesses valores poderá mudar o provedor aceito pelo backend público. Mantenha `CONVEX_SITE_URL`, `CONVEX_DEPLOY_KEY`, os segredos Google legados e a configuração Freebuff atuais enquanto houver contas usando o fluxo anterior.

A API key Firebase Web pode ser pública; `AUTH_GOOGLE_SECRET`, credenciais de serviço e chaves privadas não podem ser expostas no frontend. Não use credenciais do deployment Production em um build de teste sem autorização explícita.

## Contas e dados existentes: atenção antes de ativar em Production

O Convex separa os snapshots financeiros por `identity.subject`. A conta antiga e uma conta Firebase têm identificadores diferentes. Portanto, uma conta Firebase recém-criada não encontrará automaticamente os snapshots salvos pela autenticação antiga; isso não significa que os dados foram apagados.

Durante a transição, o formulário Firebase inclui o link **“Acessar temporariamente minha conta antiga”**. Use-o para continuar entrando com o método anterior e acessar o snapshot antigo. O projeto não migra nem associa dados automaticamente por e-mail, não copia snapshots entre identidades e não deve ser ativado em Production até existir uma migração autenticada, reversível e testada. Use um deployment Convex não produtivo para o primeiro teste; não grave dados de teste no deployment que contém seus dados reais.

## Autenticação e acesso ao Convex

O modo Firebase envia ao Convex o token de identidade do Firebase. O backend valida assinatura, emissor, público e exige o claim de e-mail verificado para operações financeiras e registros de pessoas. O modo Convex legado mantém as regras atuais. Cada conta Firebase usa seu próprio UID como chave da partição financeira.

## Sincronização e conflitos

Os snapshots são isolados pela identidade autenticada e divididos em blocos. Revisões otimizadas por compare-and-swap impedem que uma sessão sobrescreva em silêncio uma revisão mais nova de outro dispositivo. Se houver conflito, o app bloqueia a gravação da sessão conflitante e informa que é necessário exportar o estado e recarregar. A rotina não faz merge campo a campo.

Um snapshot tem limite de 12 MB por conta. O backend confirma as gravações ou retorna erro; o status no painel Conta exibe falha/conflito e oferece uma tentativa manual. Não declare sucesso de sincronização sem verificar o estado “Dados sincronizados com sua conta”. Use exportação periódica como cópia adicional: a nuvem não substitui backup independente.

## Deploy e validação

Não ative o Firebase no deployment Production como parte desta etapa. Primeiro configure e valide o Preview com um deployment Convex não produtivo. Verifique cadastro por e-mail, confirmação de endereço, redefinição de senha, login Google e login e-mail/senha. Confirme também que contas Firebase não leem nem alteram snapshots legados, que o link de acesso antigo continua funcionando e que gravação, conflito, sincronização e exclusão continuam restritos ao `subject` autenticado.
