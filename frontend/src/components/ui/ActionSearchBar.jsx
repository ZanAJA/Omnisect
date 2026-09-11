import { AnimatePresence, motion } from 'motion/react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import X from 'lucide-react/dist/esm/icons/x.js';

export default function ActionSearchBar({
  anchorRef,
  inputRef,
  value,
  open,
  onChange,
  onFocus,
  onEscape,
}) {
  const hasQuery = value.trim().length > 0;

  const clearSearch = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div ref={anchorRef} className="action-search-shell">
      <div className={`header-search-field ${open ? 'is-open' : ''}`}>
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={hasQuery ? 'ready' : 'search'}
            className="action-search-leading"
            initial={{ opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.16 }}
            aria-hidden="true"
          >
            {hasQuery ? <ArrowRight strokeWidth={1.9} /> : <Search strokeWidth={1.9} />}
          </motion.span>
        </AnimatePresence>

        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.currentTarget.blur();
              onEscape();
            }
          }}
          placeholder="Search commands or targets"
          role="combobox"
          aria-label="Search commands, targets, and findings"
          aria-expanded={open}
          aria-controls="command-search-results"
          aria-autocomplete="list"
        />

        <AnimatePresence initial={false}>
          {hasQuery && (
            <motion.button
              type="button"
              className="action-search-clear"
              onClick={clearSearch}
              aria-label="Clear search"
              title="Clear search"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.14 }}
            >
              <X strokeWidth={1.9} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
