import { BsCheck } from "react-icons/bs";

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function Checkbox({ checked, onChange, disabled = false }: CheckboxProps) {
    return (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            className={`
        w-4 h-4 rounded border flex items-center justify-center transition-all
        ${checked
                    ? 'bg-accent border-accent'
                    : 'border-white/20 bg-transparent hover:border-white/40'
                }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
        >
            {checked && (
                <BsCheck size={18} className="text-background" />
            )}
        </button>
    );
}
