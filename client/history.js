// react-router v6 全局 history 单例：
// 供 Application 的 HistoryRouter 与 BlockPrompt（路由离开确认）共用同一实例。
import { createBrowserHistory } from 'history';

export default createBrowserHistory();
