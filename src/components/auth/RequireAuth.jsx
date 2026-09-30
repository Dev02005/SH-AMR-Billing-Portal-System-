import { Navigate, useLocation } from 'react-router-dom';
import { getUser, isSignedIn } from '../../api/session';

/**
 * Route guard for a portal's authenticated pages.
 *
 * Every portal route used to render straight from the URL, so typing
 * /kitchen, /server or /billing showed the dashboard to anyone - the login
 * page was only a convention.
 */
export default function RequireAuth({ roles, loginPath, children }) {
  const location = useLocation();

  if (!isSignedIn()) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  const user = getUser();
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="access-denied">
        <h2>Access denied</h2>
        <p>
          This portal is for {roles.join(' or ')} accounts. You are signed in as
          {' '}<strong>{user.role}</strong>.
        </p>
        <a className="access-denied-link" href={loginPath}>Sign in with a different account</a>
      </div>
    );
  }

  return children;
}
