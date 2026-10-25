// Fetch modules on navigation intent, without rendering pages or fetching user data.
const loaders:Record<string,()=>Promise<unknown>>={
 '/dashboard':()=>import('../pages/app/HomePage'),
 '/dashboard/transacoes':()=>import('../pages/app/TransactionsPage'),
 '/dashboard/emprestimos':()=>import('../pages/app/LoansPage'),
 '/dashboard/relatorios':()=>import('../pages/app/ReportsPage'),
 '/dashboard/financiamentos':()=>import('../pages/app/FinancingsPage'),
 '/dashboard/metas':()=>import('../pages/app/GoalsPage'),
 '/dashboard/analise':()=>import('../pages/app/InsightsPage'),
 '/dashboard/pessoas':()=>import('../pages/app/PeoplePage'),
 '/dashboard/perfis':()=>import('../pages/app/ProfilesPage'),
 '/dashboard/conta':()=>import('../pages/app/AccountPage'),
 '/dashboard/reservas':()=>import('../pages/app/ReservesPage'),
 '/dashboard/cartoes':()=>import('../pages/app/CardsPage'),
 '/dashboard/compras-cartao':()=>import('../pages/app/CardPurchasesPage'),
 '/dashboard/notificacoes':()=>import('../pages/app/NotificationsPage'),
 '/dashboard/categorias':()=>import('../pages/app/CategoriesPage'),
};
const loaded=new Set<string>();
export function preloadRoute(path:string){if(!loaders[path]||loaded.has(path))return;loaded.add(path);void loaders[path]().catch(()=>loaded.delete(path));}
