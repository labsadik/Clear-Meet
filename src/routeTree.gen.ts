/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as LoginRouteImport } from './routes/login'
import { Route as SignupRouteImport } from './routes/signup'
import { Route as ForgotPasswordRouteImport } from './routes/forgot-password'
import { Route as DashboardRouteImport } from './routes/dashboard'
import { Route as ProfileRouteImport } from './routes/profile'
import { Route as SettingsRouteImport } from './routes/settings'
import { Route as MeetingMeetingSlugRouteImport } from './routes/meeting.$meetingSlug'
const IndexRoute=IndexRouteImport.update({id:'/',path:'/',getParentRoute:()=>rootRouteImport}as any)
const LoginRoute=LoginRouteImport.update({id:'/login',path:'/login',getParentRoute:()=>rootRouteImport}as any)
const SignupRoute=SignupRouteImport.update({id:'/signup',path:'/signup',getParentRoute:()=>rootRouteImport}as any)
const ForgotPasswordRoute=ForgotPasswordRouteImport.update({id:'/forgot-password',path:'/forgot-password',getParentRoute:()=>rootRouteImport}as any)
const DashboardRoute=DashboardRouteImport.update({id:'/dashboard',path:'/dashboard',getParentRoute:()=>rootRouteImport}as any)
const ProfileRoute=ProfileRouteImport.update({id:'/profile',path:'/profile',getParentRoute:()=>rootRouteImport}as any)
const SettingsRoute=SettingsRouteImport.update({id:'/settings',path:'/settings',getParentRoute:()=>rootRouteImport}as any)
const MeetingMeetingSlugRoute=MeetingMeetingSlugRouteImport.update({id:'/meeting/$meetingSlug',path:'/meeting/$meetingSlug',getParentRoute:()=>rootRouteImport}as any)
export interface FileRoutesByFullPath{'/':typeof IndexRoute;'/login':typeof LoginRoute;'/signup':typeof SignupRoute;'/forgot-password':typeof ForgotPasswordRoute;'/dashboard':typeof DashboardRoute;'/profile':typeof ProfileRoute;'/settings':typeof SettingsRoute;'/meeting/$meetingSlug':typeof MeetingMeetingSlugRoute}
export interface FileRoutesByTo{'/':typeof IndexRoute;'/login':typeof LoginRoute;'/signup':typeof SignupRoute;'/forgot-password':typeof ForgotPasswordRoute;'/dashboard':typeof DashboardRoute;'/profile':typeof ProfileRoute;'/settings':typeof SettingsRoute;'/meeting/$meetingSlug':typeof MeetingMeetingSlugRoute}
export interface FileRoutesById{__root__:typeof rootRouteImport;'/':typeof IndexRoute;'/login':typeof LoginRoute;'/signup':typeof SignupRoute;'/forgot-password':typeof ForgotPasswordRoute;'/dashboard':typeof DashboardRoute;'/profile':typeof ProfileRoute;'/settings':typeof SettingsRoute;'/meeting/$meetingSlug':typeof MeetingMeetingSlugRoute}
export interface FileRouteTypes{fileRoutesByFullPath:FileRoutesByFullPath;fullPaths:'/'|'/login'|'/signup'|'/forgot-password'|'/dashboard'|'/profile'|'/settings'|'/meeting/$meetingSlug';fileRoutesByTo:FileRoutesByTo;to:'/'|'/login'|'/signup'|'/forgot-password'|'/dashboard'|'/profile'|'/settings'|'/meeting/$meetingSlug';id:'__root__'|'/'|'/login'|'/signup'|'/forgot-password'|'/dashboard'|'/profile'|'/settings'|'/meeting/$meetingSlug';fileRoutesById:FileRoutesById}
export interface RootRouteChildren{IndexRoute:typeof IndexRoute;LoginRoute:typeof LoginRoute;SignupRoute:typeof SignupRoute;ForgotPasswordRoute:typeof ForgotPasswordRoute;DashboardRoute:typeof DashboardRoute;ProfileRoute:typeof ProfileRoute;SettingsRoute:typeof SettingsRoute;MeetingMeetingSlugRoute:typeof MeetingMeetingSlugRoute}
declare module '@tanstack/react-router'{interface FileRoutesByPath{'/':{id:'/';path:'/';fullPath:'/';preLoaderRoute:typeof IndexRouteImport;parentRoute:typeof rootRouteImport};'/login':{id:'/login';path:'/login';fullPath:'/login';preLoaderRoute:typeof LoginRouteImport;parentRoute:typeof rootRouteImport};'/signup':{id:'/signup';path:'/signup';fullPath:'/signup';preLoaderRoute:typeof SignupRouteImport;parentRoute:typeof rootRouteImport};'/forgot-password':{id:'/forgot-password';path:'/forgot-password';fullPath:'/forgot-password';preLoaderRoute:typeof ForgotPasswordRouteImport;parentRoute:typeof rootRouteImport};'/dashboard':{id:'/dashboard';path:'/dashboard';fullPath:'/dashboard';preLoaderRoute:typeof DashboardRouteImport;parentRoute:typeof rootRouteImport};'/profile':{id:'/profile';path:'/profile';fullPath:'/profile';preLoaderRoute:typeof ProfileRouteImport;parentRoute:typeof rootRouteImport};'/settings':{id:'/settings';path:'/settings';fullPath:'/settings';preLoaderRoute:typeof SettingsRouteImport;parentRoute:typeof rootRouteImport};'/meeting/$meetingSlug':{id:'/meeting/$meetingSlug';path:'/meeting/$meetingSlug';fullPath:'/meeting/$meetingSlug';preLoaderRoute:typeof MeetingMeetingSlugRouteImport;parentRoute:typeof rootRouteImport}}}
const rootRouteChildren:RootRouteChildren={IndexRoute,LoginRoute,SignupRoute,ForgotPasswordRoute,DashboardRoute,ProfileRoute,SettingsRoute,MeetingMeetingSlugRoute}
export const routeTree=rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()
import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start'{interface Register{ssr:true;router:Awaited<ReturnType<typeof getRouter>>;config:Awaited<ReturnType<typeof startInstance.getOptions>>}}
