import React from 'react';
import { getTypeColor } from '../../utils/overviewUtils';

interface TypeLabelProps {
    type: string;
    onClick?: () => void;
    className?: string;
}

export const TypeLabel: React.FC<TypeLabelProps> = ({ type, onClick, className }) => {
    const Component = onClick ? 'button' : 'span';

    return (
        <Component
            onClick={onClick}
            className={`text-[10px] lowercase font-mono ${getTypeColor(type)} ${onClick ? 'cursor-pointer hover:underline' : ''} ${className || ''}`}
        >
            {type}
        </Component>
    );
};
