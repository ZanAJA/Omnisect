import { LayoutGroup, motion } from 'motion/react';
import { useState } from 'react';

export default function AnimatedNavigationTabs({
  items,
  activeId,
  onChange,
  id = 'navigation',
  className = '',
}) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <LayoutGroup id={id}>
      <div className={`animated-navigation-tabs ${className}`.trim()}>
        <ul className="animated-navigation-list">
          {items.map((item) => {
            const isActive = activeId === item.id;
            const isHovered = hoveredId === item.id;

            return (
              <li key={item.id} className="animated-navigation-item">
                <button
                  type="button"
                  className={`animated-navigation-tab ${isActive ? 'is-active' : ''}`}
                  onClick={() => onChange(item.id)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(item.id)}
                  onBlur={() => setHoveredId(null)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="animated-navigation-label">{item.label}</span>
                  {isHovered && !isActive && (
                    <motion.span
                      layoutId={`${id}-hover-background`}
                      className="animated-navigation-hover"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId={`${id}-active-indicator`}
                      className="animated-navigation-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </LayoutGroup>
  );
}
