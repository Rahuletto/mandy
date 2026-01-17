import { useState, useRef } from 'react';
import type { HttpProtocol } from '../bindings';
import { HoverPopover } from './ui';

interface ProtocolToggleProps {
    value: HttpProtocol;
    onChange: (protocol: HttpProtocol) => void;
}

export function ProtocolToggle({ value, onChange }: ProtocolToggleProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);
    const isTcp = value === 'Tcp';

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = window.setTimeout(() => {
            setShowTooltip(false);
        }, 100);
    };

    return (
        <div
            ref={containerRef}
            className="relative flex items-center gap-1.5"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <span className={`text-[10px] font-medium transition-colors ${isTcp ? 'text-white/70' : 'text-white/30'}`}>
                TCP
            </span>
            <button
                type="button"
                onClick={() => onChange(isTcp ? 'Quic' : 'Tcp')}
                className="relative w-7 h-3.5 rounded-full transition-colors focus:outline-none"
                style={{
                    backgroundColor: isTcp ? 'rgba(255,255,255,0.2)' : 'var(--color-accent)',
                }}
            >
                <span
                    className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all duration-200"
                    style={{
                        left: isTcp ? '2px' : 'calc(100% - 12px)',
                    }}
                />
            </button>
            <span className={`text-[10px] font-medium transition-colors ${!isTcp ? 'text-accent' : 'text-white/30'}`}>
                QUIC
            </span>

            {}
            {showTooltip && containerRef.current && (
                <HoverPopover
                    anchorRef={containerRef as React.RefObject<HTMLElement>}
                    className="w-[240px]"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {}
                    <div className="mb-3">
                        <div className="text-xs font-semibold text-white mb-1">TCP (HTTP/1.1 & HTTP/2)</div>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                            Standard protocol using TCP connections. Reliable, widely supported.
                            Requires separate TCP handshake and TLS negotiation steps.
                        </p>
                    </div>

                    {}
                    <div>
                        <div className="text-xs font-medium text-white mb-1">QUIC (HTTP/3)</div>
                        <p className="text-[10px] text-white/50 leading-relaxed">
                            Modern protocol using UDP. Faster connection setup with 0-RTT.
                            Built-in encryption. May not be supported by all servers.
                        </p>
                    </div>
                </HoverPopover>
            )}
        </div>
    );
}
