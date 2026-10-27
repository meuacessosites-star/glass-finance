# Configuração necessária para autenticação e sincronização

O frontend e as funções Convex estão preparados para Google OAuth, email/senha, recuperação de senha e sincronização por conta. **O login e o banco só ficam operacionais após o deploy do Convex e a configuração dos segredos no deployment real.** Não coloque valores de segredo em `.env` enviado ao Git, no código, em mensagens do chat ou em variáveis públicas `VITE_*`.

## 1. Email e senha

A confirmação de cadastro por email, login legado por código e redefinição de senha usam o serviço de email OTP já integrado pelo backend. Cadastre uma nova chave de API no ambiente Convex de produção, usando o dashboard Convex ou a CLI autenticada:

```sh
npx convex env set AUTH_EMAIL_API_KEY <SEGREDO_NOVO_DO_SERVICO_DE_EMAIL>
npx convex env set VLY_APP_NAME "Glass Finance"
```

A chave anterior estava embutida em código versionado. **Revogue-a/rotacione-a no serviço de email e use somente a nova chave como segredo do deployment.** A chave não deve ser adicionada a este repositório.

## 2. Login com Google

No Google Cloud Console, crie/configure um OAuth Client ID do tipo Web. Adicione como URI de redirecionamento autorizado a URL do host de autenticação Convex com o caminho `/api/auth/callback/google` (por exemplo, `https://<DEPLOYMENT>.convex.site/api/auth/callback/google`). Adicione também o domínio publicado do app às origens JavaScript autorizadas quando solicitado pelo Google.

Configure os dois valores no deployment Convex **de produção**:

```sh
npx convex env set AUTH_GOOGLE_ID <CLIENT_ID>
npx convex env set AUTH_GOOGLE_SECRET <CLIENT_SECRET>
```

O `CLIENT_SECRET` é segredo exclusivo do backend. Confira que o URI de callback do Google e o `CONVEX_SITE_URL` daquele deployment correspondem exatamente ao endereço usado em produção.
Se o deployment usa um domínio customizado de autenticação, configure também `CUSTOM_AUTH_SITE_URL` no Convex e use esse domínio no URI de callback do Google, sem barra final.

## 3. Deploy e validação

Após configurar os segredos no projeto/deployment correto, aplique o schema e as funções de autenticação e sincronização com a CLI Convex autenticada; em um deployment de produção vinculado, use `npx convex deploy`. Em seguida publique uma nova compilação do frontend que aponta para esse mesmo deployment (`VITE_CONVEX_URL`). No ambiente atual desta tarefa não há sessão CLI Convex nem arquivos de configuração do deployment, por isso o backend não foi publicado e nenhum fluxo OAuth real foi exercitado.

Validação manual obrigatória no site publicado: criar uma conta com email/senha, confirmar código, sair e entrar; redefinir senha; entrar com Google; criar um lançamento, aguardar o status “Dados sincronizados com sua conta”, entrar na mesma conta em outro dispositivo e confirmar que o registro aparece; editar nos dois dispositivos para verificar o tratamento de concorrência; exportar um backup e testar a exclusão somente depois de uma cópia segura.

## 4. Sincronização e conflitos

Os snapshots são isolados pela identidade Convex autenticada e divididos em blocos. Revisões otimizadas por compare-and-swap impedem que uma sessão sobrescreva em silêncio uma revisão mais nova de outro dispositivo. Se houver conflito, o app bloqueia a gravação da sessão conflitante e informa que é necessário exportar o estado e recarregar. A rotina não faz merge campo a campo.

Um snapshot tem limite de 12 MB por conta. O backend confirma as gravações ou retorna erro; o status no painel Conta exibe falha/conflito e oferece uma tentativa manual. Não declare sucesso de sincronização sem verificar o estado “Dados sincronizados com sua conta”. Use exportação periódica como cópia adicional: a nuvem não substitui backup independente.
