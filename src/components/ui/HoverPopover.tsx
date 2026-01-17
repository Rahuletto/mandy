import { useState, useRef, useEffect, type ReactNode } from 'react';

interface HoverPopoverProps {
    children: ReactNode;
    anchorRef: React.RefObject<HTMLElement>;
    onClose?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    className?: string;
    position?: 'top' | 'bottom';
}

export function HoverPopover({
    children,
    anchorRef,
    onClose,
    onMouseEnter,
    onMouseLeave,
    className = '',
    position = 'top'
}: HoverPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const updatePosition = () => {
            if (anchorRef.current && popoverRef.current) {
                const anchorRect = anchorRef.current.getBoundingClientRect();
                const popoverRect = popoverRef.current.getBoundingClientRect();

                let top: number;
                let left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;

                if (position === 'top') {
                    top = anchorRect.top - popoverRect.height - 8;
                } else {
                    top = anchorRect.bottom + 8;
                }

                if (left < 8) left = 8;
                if (left + popoverRect.width > window.innerWidth - 8) {
                    left = window.innerWidth - popoverRect.width - 8;
                }

                if (position === 'top' && top < 8) {
                    top = anchorRect.bottom + 8;
                } else if (position === 'bottom' && top + popoverRect.height > window.innerHeight - 8) {
                    top = anchorRect.top - popoverRect.height - 8;
                }

                setCoords({ top, left });
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorRef, position]);

    useEffect(() => {
        if (!onClose) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={popoverRef}
            className={`fixed z-50 bg-card border border-white/10 rounded-lg shadow-2xl p-3 ${className}`}
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {children}
        </div>
    );
}
