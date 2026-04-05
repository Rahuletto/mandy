import { BsCheck } from "react-icons/bs";

interface CheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}

export function Checkbox({
	checked,
	onChange,
	disabled = false,
}: CheckboxProps) {
	return (
		<button
			type="button"
			onClick={() => !disabled && onChange(!checked)}
			disabled={disabled}
			className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
				checked
					? "border-accent bg-accent"
					: "border-white/20 bg-transparent hover:border-white/40"
			}
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
      `}
		>
			{checked && <BsCheck size={18} className="text-background" />}
		</button>
	);
}
