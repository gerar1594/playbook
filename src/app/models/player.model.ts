export interface Player {
    id: string;
    number: number;
    color: string;
    size?: number; // Tamaño dinámico
}

export interface PlayerPosition {
    playerId: string;
    currentPos: { x: number, y: number };
    targetPos?: { x: number, y: number };
    shotTarget?: { x: number, y: number };
    hasBall?: boolean;
    passTargetId?: string;
    isBlock?: boolean;
}

export interface PlayerOnCourt {
    player: Player;
    currentPos: { x: number, y: number };
    targetPos?: { x: number, y: number , points?: { x: number, y: number }[], movementPoints?: {x: number, y: number}[]}; // Para animación de pase
    shotTarget?: { x: number, y: number };
    originalPos?: { x: number, y: number };
    initialPos?: { x: number, y: number };
    hasDiscrepancy?: boolean;
    hasBall?: boolean;
    passTargetId?: string;
    isDribble?: boolean;
    isBlock?: boolean;
}

export interface PlaybookFrame {
    id: number;
    positions: PlayerPosition[];
}