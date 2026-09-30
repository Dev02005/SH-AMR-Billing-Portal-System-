import { useEffect, useState } from 'react';
import MenuPopup, { MenuGroup, MenuItem } from '../ui/MenuPopup';
import { activeTheme, setTheme } from '../../styles/theme';
import { GearIcon } from '../ui/icons';
import { fullScreenSupported, isFullScreen, onFullScreenChange, toggleFullScreen } from '../../utils/fullscreen';

/** Turn a stored username into something worth showing on screen. */
function displayName(user) {
  const name = user?.username;
  if (!name) return 'Staff';

  const cashier = name.match(/^cash?er\s*(\d*)$/i);
  if (cashier) return cashier[1] ? `Cashier ${cashier[1]}` : 'Cashier';

  const numbered = name.match(/^([a-z]+?)(\d+)$/i);
  if (numbered) {
    const word = numbered[1];
    return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${numbered[2]}`;
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function SettingsDropdown({
  user,
  onLogout,
  onAddCategory,
  onDeleteCategory,
  onAddMenu,
  onEditMenu,
  onDeleteMenu,
  allowFullScreen = false,
}) {
  const [openGroup, setOpenGroup] = useState(null);
  const [theme, setThemeState] = useState(() => activeTheme());
  const [fullScreen, setFullScreen] = useState(() => isFullScreen());
  const isAdmin = user?.role === 'admin';
  const showFullScreen = allowFullScreen && fullScreenSupported();

  // Esc or the phone's back gesture also leave full screen; keep the label true.
  useEffect(() => onFullScreenChange(() => setFullScreen(isFullScreen())), []);

  const toggle = (name) => setOpenGroup((current) => (current === name ? null : name));

  const pickTheme = (next) => setThemeState(setTheme(next));

  return (
    <MenuPopup trigger={<GearIcon />} label="Settings" align="left">
      {(close) => {
        const run = (action) => () => { close(); action?.(); };

        return (
          <>
            <div className="menu-user">
              <span className="menu-user-name">{displayName(user)}</span>
              <span className="menu-user-role">{user?.role || 'staff'}</span>
            </div>

            {isAdmin && (
              <>
                <MenuGroup
                  label="Categories"
                  open={openGroup === 'category'}
                  onToggle={() => toggle('category')}
                >
                  <MenuItem onClick={run(onAddCategory)}>Add category</MenuItem>
                  <MenuItem onClick={run(onDeleteCategory)} danger>Delete category</MenuItem>
                </MenuGroup>

                <MenuGroup
                  label="Menu items"
                  open={openGroup === 'menu'}
                  onToggle={() => toggle('menu')}
                >
                  <MenuItem onClick={run(onAddMenu)}>Add item</MenuItem>
                  <MenuItem onClick={run(onEditMenu)}>Edit item</MenuItem>
                  <MenuItem onClick={run(onDeleteMenu)} danger>Delete item</MenuItem>
                </MenuGroup>

                <div className="menu-divider" />
              </>
            )}

            <MenuGroup
              label="Theme"
              open={openGroup === 'theme'}
              onToggle={() => toggle('theme')}
            >
              <MenuItem
                onClick={() => { pickTheme('light'); }}
                className={theme === 'light' ? 'is-active' : ''}
              >
                Light
              </MenuItem>
              <MenuItem
                onClick={() => { pickTheme('dark'); }}
                className={theme === 'dark' ? 'is-active' : ''}
              >
                Dark
              </MenuItem>
            </MenuGroup>

            {showFullScreen && (
              <MenuItem onClick={run(toggleFullScreen)}>
                {fullScreen ? 'Exit full screen' : 'Full screen'}
              </MenuItem>
            )}

            <div className="menu-divider" />

            <MenuItem onClick={run(onLogout)} danger>Log out</MenuItem>
          </>
        );
      }}
    </MenuPopup>
  );
}
