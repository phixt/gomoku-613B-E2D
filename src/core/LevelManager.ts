export interface LevelConfig {
    id: string;
    name: string;
    boardSize: number;
    layers: number;
    initialMoves: Array<{ x: number; y: number; z: number; player: 1 | 2 }>;
    winLength: number;
}

const LEVELS: Record<string, LevelConfig> = {
    tutorial: {
        id: 'tutorial',
        name: 'LEVEL_TUTORIAL',
        boardSize: 9,
        layers: 1,
        initialMoves: [],
        winLength: 5
    },
    residual: {
        id: 'residual',
        name: 'LEVEL_RESIDUAL',
        boardSize: 13,
        layers: 6,
        winLength: 5,
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