export interface LevelConfig {
    id: string;
    name: string;
    boardSize: number;
    layers: number;
    initialMoves: Array<{ x: number; y: number; z: number; player: 1 | 2 }>;
}

const LEVELS: Record<string, LevelConfig> = {
    tutorial: {
        id: 'tutorial',
        name: '9x9 Tutorial',
        boardSize: 9,
        layers: 1,
        initialMoves: []
    },
    residual: {
        id: 'residual',
        name: '13x13 Residual',
        boardSize: 13,
        layers: 6,
        initialMoves: [
            { x: 6, y: 6, z: 0, player: 1 },
            { x: 7, y: 6, z: 0, player: 1 },
            { x: 5, y: 6, z: 0, player: 2 }
        ]
    }
};

export const LevelManager = {
    getLevel(id: string): LevelConfig | undefined {
        return LEVELS[id];
    },
    getAllIds(): string[] {
        return Object.keys(LEVELS);
    }
};