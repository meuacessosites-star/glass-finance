# Plano: adicionar Firebase Auth ao Glass Finance

## Objetivo
Adicionar Firebase Authentication para cadastro/login por e-mail e senha, confirmação de endereço, recuperação de senha e Google, mantendo Convex como backend e armazenamento financeiro. A autenticação atual Convex Auth/Freebuff deve continuar disponível como modo padrão e rollback até existir uma migração de identidade segura.

## Estrutura e responsabilidades
- `src/lib/firebase.ts`: inicialização do Firebase Web SDK com variáveis `VITE_FIREBASE_*`; não guardar segredos no Git.
- `src/auth/`: estado de sessão Firebase, adaptador `ConvexProviderWithAuth` e ponte de ações de autenticação.
- `src/pages/auth/`: tela Firebase de cadastro/login/recuperação; a tela Convex existente permanece como fallback.
- `src/convex/auth.config.ts`: aceitar tokens Convex, Freebuff legado e Firebase por Firebase Project ID, sem remover provedores existentes.
- `src/hooks/use-auth.ts` e `src/lib/app-store.tsx`: expor identidade compatível para a interface sem tratar usuário Firebase como usuário da tabela interna Convex Auth.
- `docs/PRODUCTION_AUTH_AND_SYNC.md`: documentar configuração, ativação reversível e limites de migração.

## Abordagem
A seleção `VITE_AUTH_PROVIDER` é aditiva e reversível: sem valor ou com `convex`, preserva o comportamento atual; com `firebase`, usa Firebase para autenticar e passar o ID token ao Convex. A identidade Firebase é um novo `subject`; portanto snapshots existentes, particionados por `identity.subject`, não são copiados, vinculados por e-mail nem sobrescritos automaticamente. O formulário mantém acesso temporário à conta legada. O modo Firebase não deve ser ativado no deployment Production antes de definir uma migração autenticada e testar com deployment Convex não produtivo.

## Dependências e configuração
Usar o Firebase Web SDK. O frontend precisa de `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` e `VITE_FIREBASE_APP_ID`; o Convex precisa de `FIREBASE_PROJECT_ID` durante a publicação da configuração Auth. A API key Web é uma configuração pública do cliente, não um segredo; nenhum segredo de serviço Firebase deve ser colocado em variáveis `VITE_*`. O `scripts/vercel-build.mjs` publica Convex somente em Production; Preview compila apenas o frontend, então um backend Convex de teste deve ser publicado separadamente.

## Estado e validações
Código implementado localmente. `npm run typecheck` passou; `npm run build` passou com o provider legado padrão, com Firebase selecionado usando valores fictícios e, agora, com a configuração pública do app Firebase mostrada pelo usuário. 31 testes de cálculos financeiros passaram no fuso `America/Sao_Paulo`. O deployment Convex Development `dynamic-finch-230` foi criado no projeto Glass Finance, recebeu `FIREBASE_PROJECT_ID` apenas no ambiente de desenvolvimento e aceitou o deploy das funções. A prévia de frontend e os fluxos de login reais ainda não foram testados. Os dados de contas existentes permanecem nos subjects originais; não fazer deploy nem alterar variáveis Production durante esta etapa. Revisar os 18 avisos do `npm audit --omit=dev` antes de qualquer publicação.
