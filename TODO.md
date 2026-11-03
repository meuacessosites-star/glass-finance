# TODO — Firebase Auth

## Critérios de resultado

- [ ] Adicionar login Firebase sem desativar o fluxo atual: “o projeto deve continuar permitindo Convex Auth/Freebuff como modo padrão e oferecer modo Firebase selecionável por configuração explícita; cadastro e login Firebase devem suportar e-mail/senha, confirmação por e-mail, redefinição de senha e Google; Firebase deve emitir tokens aceitos pelo Convex; segredos não devem ser colocados no frontend nem versionados”.
- [ ] Proteger os dados financeiros durante a troca: “o acesso aos snapshots e chunks existentes deve permanecer ligado à identidade original; não vincular automaticamente contas apenas por e-mail; uma identidade Firebase sem vínculo não deve ler, mover ou sobrescrever dados de outra identidade; não ativar modo Firebase em Production antes de uma migração autenticada, backup/reversão e teste em deployment não produtivo”.
- [ ] Documentar e validar a configuração Firebase/Vercel/Convex: “usar variáveis de cliente Firebase públicas somente no frontend e o Project ID no Convex; manter configuração atual e rollback documentados; validar typecheck, build, fluxos Firebase e acesso aos dados antes de qualquer ativação pública”.

## Progresso

- [x] Implementados o cliente Firebase, a tela de cadastro/login/recuperação e a ponte do token Firebase para Convex, mantendo Convex Auth/Freebuff como padrão.
- [x] Mantido um caminho visível para voltar à conta antiga; snapshots antigos não são migrados nem vinculados por e-mail automaticamente.
- [x] Adicionada validação backend do claim `emailVerified` para identidades Firebase em dados financeiros e pessoas.
- [x] Criado o deployment Convex **Development** `dynamic-finch-230`, separado de Production; `FIREBASE_PROJECT_ID` foi definido apenas nele e as funções Convex foram publicadas com sucesso.
- [x] Build local passou com o modo Firebase selecionado e a configuração pública do app Web mostrada pelo usuário; `.env.local` aponta para o backend Development e está ignorado pelo Git.
- [x] `npm run typecheck` passou; `npm run build` passou com o modo legado padrão e com valores Firebase fictícios em validação anterior; 31 testes financeiros passaram; revisão estática corrigiu o link de retorno legado.
- [ ] Preparar e testar uma prévia isolada do frontend (Vercel Preview ou URL temporária) conectada ao deployment Convex Development.
- [ ] Exercitar login Google, cadastro/confirmação e-mail/senha, recuperação de senha e gravação/sincronização com credenciais reais. Não criar conta nem usar dados reais sem ação do usuário.
- [ ] Projetar e testar um fluxo autenticado de migração de snapshots antes de avaliar ativação Firebase em Production.
- [ ] Revisar os 18 avisos encontrados por `npm audit --omit=dev`, incluindo avisos críticos em dependências de autenticação, antes de qualquer publicação; não executar `npm audit fix --force` sem revisão de compatibilidade.

Não publicado no GitHub nem na Production nesta etapa. O login real ainda não foi exercitado com credenciais do Firebase.
