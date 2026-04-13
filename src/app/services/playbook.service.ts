import { Injectable, signal } from '@angular/core';
import { Player, PlayerOnCourt, PlaybookFrame, PlayerPosition } from '../models/player.model';
import { BALL_CONFIG } from '../constants';

@Injectable({ providedIn: 'root' })
export class PlaybookService {
    playersInBench = signal<Player[]>([
        { id: 'p1', number: 1, color: '#2980b9', size: 40 },
        { id: 'p2', number: 2, color: '#2980b9', size: 40 },
        { id: 'p3', number: 3, color: '#2980b9', size: 40 },
        { id: 'd1', number: 5, color: '#c0392b', size: 40 },
        { id: 'd2', number: 0, color: '#c0392b', size: 40 }
    ]);

    playersOnCourt = signal<PlayerOnCourt[]>([]);
    frames = signal<PlaybookFrame[]>([]);
    currentFrameIndex = signal<number>(-1);
    ballPositions = signal<{ id: string, x: number, y: number, s?: number }[]>([]);

    constructor() { this.addFrame(); }

    updatePlayerSize(playerId: string, newSize: number) {
        this.resetAnimationPositions();
        // Actualizar en el banquillo
        this.playersInBench.update(bench =>
            bench.map(p => p.id === playerId ? { ...p, size: newSize } : p)
        );
        // Actualizar en la pista
        this.playersOnCourt.update(court =>
            court.map(p => p.player.id === playerId ? { ...p, player: { ...p.player, size: newSize } } : p)
        );
    }

    updatePlayerMovementPoints(playerId: string, movementPoints: { x: number, y: number }[]) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(court =>
            court.map(p => p.player.id === playerId ? { ...p, targetPos: p.targetPos ? { ...p.targetPos, movementPoints } : undefined } : p)
        );
    }

    isBallActive(playerId: string) {
        const player = this.playersOnCourt().find(p => p.player.id === playerId);
        return player?.hasBall;
    }

    addOrMovePlayer(player: Player, x: number, y: number) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current => {
            const index = current.findIndex(p => p.player.id === player.id);
            if (index !== -1) return current.map(p => p.player.id === player.id ? { ...p, currentPos: { x, y } } : p);
            return [...current, { player: { ...player, size: player.size || 40 }, currentPos: { x, y }, hasBall: false }];
        });
        this.propagateChanges();
    }

    setTarget(playerId: string, x: number, y: number) {
        console.log("Set target");
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => p.player.id === playerId ? { ...p, targetPos: { x, y }, shotTarget: undefined, passTargetId: undefined, isDribble: p.hasBall, isBlock: false } : p)
        );
        this.propagateChanges();
    }

    addMovementPoint(playerId: string, x: number, y: number) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => {
                if (p.player.id !== playerId || !p.targetPos) return p;
                const extraPoints = p.targetPos.points ? [...p.targetPos.points] : [];
                return {
                    ...p,
                    targetPos: {
                        ...p.targetPos,
                        points: [...extraPoints, { x, y }]
                    }
                };
            })
        );
        this.propagateChanges();
    }

    removeMovementPoint(playerId: string, pointIndex: number) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => {
                if (p.player.id !== playerId || !p.targetPos?.points?.length) return p;
                const points = [...p.targetPos.points];
                points.splice(pointIndex, 1);
                return {
                    ...p,
                    targetPos: {
                        ...p.targetPos,
                        points: points
                    }
                };
            })
        );
        this.propagateChanges();
    }

    setBlock(playerId: string, x: number, y: number) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => p.player.id === playerId ? { ...p, targetPos: { x, y }, shotTarget: undefined, passTargetId: undefined, isDribble: false, isBlock: true } : p)
        );
        this.propagateChanges();
    }

    setShot(playerId: string, x: number, y: number) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => p.player.id === playerId ? {
                ...p,
                shotTarget: { x, y },
                targetPos: undefined,
                passTargetId: undefined,
                hasBall: true,
                isDribble: false
            } : p)
        );
        this.propagateChanges();
    }

    setPass(passerId: string, receiverId: string) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current =>
            current.map(p => p.player.id === passerId ? { ...p, passTargetId: receiverId, targetPos: undefined } : p)
        );
        this.propagateChanges();
    }

    toggleBall(playerId: string) {
        this.resetAnimationPositions();
        this.playersOnCourt.update(current => 
            current.map(p => {
                if (p.player.id === playerId) {
                    const newHasBall = !p.hasBall;

                    // Si se está quitando el balón y hay un pase configurado, eliminarlo completamente
                    if (p.hasBall && !newHasBall && p.passTargetId) {
                        return { 
                            ...p, 
                            hasBall: newHasBall, 
                            isDribble: false,
                            passTargetId: undefined,
                            targetPos: undefined,
                            shotTarget: undefined
                        };
                    }

                    return { ...p, hasBall: newHasBall, isDribble: newHasBall && !!p.targetPos, shotTarget: newHasBall ? p.shotTarget : undefined };
                }
                return p;
            })
        );
        this.propagateChanges();
    }

    resetPlayerPosition(playerId: string) {
        this.resetAnimationPositions();
        const idx = this.currentFrameIndex();
        if (idx <= 0) return;
        const prev = this.frames()[idx - 1];
        const status = prev.positions.find(p => p.playerId === playerId);
        if (status) {
            const finalPos = status.targetPos || status.currentPos;
            this.playersOnCourt.update(curr => curr.map(p => p.player.id === playerId ? { ...p, currentPos: { ...finalPos }, hasDiscrepancy: false } : p));
            this.propagateChanges();
        }
    }

    public resetAnimationPositions() {
        const idx = this.currentFrameIndex();
        if (idx === -1) return;
        const frame = this.frames()[idx];
        this.playersOnCourt.update(current =>
            current.map(p => {
                const original = frame.positions.find(pos => pos.playerId === p.player.id);
                if (!original) return p;
                return {
                    ...p,
                    currentPos: { ...original.currentPos },
                    initialPos: original.currentPos ? { ...original.currentPos } : undefined
                };
            })
        );
    }

    private propagateChanges() {
        const idx = this.currentFrameIndex();
        if (idx === -1) return;
        this.frames.update(all => {
            const newFrames = [...all];
            newFrames[idx] = {
                id: newFrames[idx].id,
                positions: this.playersOnCourt().map(p => ({
                    playerId: p.player.id, currentPos: { ...p.currentPos }, 
                    targetPos: p.targetPos ? { ...p.targetPos } : undefined,
                    shotTarget: p.shotTarget ? { ...p.shotTarget } : undefined,
                    hasBall: p.hasBall, passTargetId: p.passTargetId, isBlock: p.isBlock
                }))
            };
            // Propagación simple para este ejemplo (herencia de balón)
            for (let i = idx + 1; i < newFrames.length; i++) {
                const prev = newFrames[i-1];
                newFrames[i].positions = newFrames[i].positions.map(pos => {
                    const stPrev = prev.positions.find(p => p.playerId === pos.playerId);
                    if (stPrev) {
                        const received = prev.positions.some(p => p.passTargetId === pos.playerId);
                        const gave = stPrev.passTargetId !== undefined;
                        pos.hasBall = received ? true : (gave ? false : stPrev.hasBall);
                    }
                    return pos;
                });
            }
            return newFrames;
        });
        this.checkDiscrepancies();
    }

    checkDiscrepancies() {
        const idx = this.currentFrameIndex();
        if (idx <= 0) return;
        const prev = this.frames()[idx - 1];
        this.playersOnCourt.update(curr => curr.map(p => {
            const pPrev = prev.positions.find(x => x.playerId === p.player.id);
            if (!pPrev) return p;
            const exp = pPrev.targetPos || pPrev.currentPos;
            return { ...p, hasDiscrepancy: (Math.abs(p.currentPos.x - exp.x) + Math.abs(p.currentPos.y - exp.y)) > 2 };
        }));
    }

    addFrame() {
        const all = this.frames();
        let newPos: PlayerPosition[] = [];
        if (all.length > 0) {
            const last = all[all.length - 1];
            newPos = last.positions.map(p => ({
                playerId: p.playerId,
                currentPos: p.targetPos || p.currentPos,
                shotTarget: undefined,
                hasBall: last.positions.some(prev => prev.passTargetId === p.playerId) ? true : (p.passTargetId ? false : p.hasBall),
                targetPos: undefined, passTargetId: undefined, isBlock: undefined
            }));
        }
        this.frames.update(f => [...f, { id: Math.random(), positions: newPos }]);
        this.loadFrame(this.frames().length - 1);
    }

    loadFrame(index: number) {
        this.currentFrameIndex.set(index);
        const frame = this.frames()[index];
        this.playersOnCourt.set(frame.positions.map(pos => ({
            player: this.playersInBench().find(b => b.id === pos.playerId)!,
            currentPos: { ...pos.currentPos },
            targetPos: pos.targetPos ? { ...pos.targetPos } : undefined,
            shotTarget: pos.shotTarget ? { ...pos.shotTarget } : undefined,
            hasBall: pos.hasBall, passTargetId: pos.passTargetId,
            isDribble: pos.hasBall && !!pos.targetPos,
            isBlock: pos.isBlock
        })));
        this.checkDiscrepancies();
    }

    async startAnimationStep() {
        // Primero, identificar si hay pases en curso
        let trajectoriesMovement: { id: string, trajectory: { x: number, y: number, s?: number }[] }[] = [];

        const playersWithMovement = this.playersOnCourt().filter(p => p.targetPos);
        if (playersWithMovement.length > 0) {
            for (const player of playersWithMovement) {
                if (player.targetPos) {
                    trajectoriesMovement.push({ id: player.player.id, trajectory: [...(player.targetPos.points || []), { x: player.targetPos.x, y: player.targetPos.y } ] });
                }
            }
        }

        const trajectories: { id: string, trajectory: { x: number, y: number, s?: number }[] }[] = [];


        const playersWithPass = this.playersOnCourt().filter(p => p.passTargetId);

        if (playersWithPass.length > 0) {
            // Para cada pase, calcular la trayectoria del balón

            for (const passer of playersWithPass) {
                const receiver = this.playersOnCourt().find(p => p.player.id === passer.passTargetId);

                if (receiver) {
                    // Calcular trayectoria lineal del balón
                    const startX = passer.currentPos.x;
                    const startY = passer.currentPos.y;
                    const playerSize = passer.player.size || 0;
                    const endX = receiver.currentPos.x - playerSize / 2 + BALL_CONFIG.BASE_SIZE / 4; // Ajustar para que apunte al centro del jugador 
                    const endY = receiver.currentPos.y - playerSize / 2 + BALL_CONFIG.BASE_SIZE / 4; // Ajustar para que apunte al centro del jugador

                    // Generar puntos de la trayectoria lineal
                    const steps = 20; // Número de pasos para la animación
                    const trajectory: { x: number, y: number, s?:number  }[] = [];

                    for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const x = startX + (endX - startX) * t;
                        const y = startY + (endY - startY) * t;
                        trajectory.push({ x, y });
                    }

                    trajectories.push({ id: passer.player.id + '-' + receiver.player.id, trajectory });
                }
            }

            // Iniciar animación de todos los balones
        }

        const playerWithShoot = this.playersOnCourt().filter(p => p.shotTarget);
        if (playerWithShoot.length > 0) {
            /*const shot = playerWithShot.shotTarget!;
            this.ballPositions.set([{ id: playerWithShot.player.id, x: shot.x, y: shot.y }]);
            setTimeout(() => this.ballPositions.set([]), 1000);*/

            for (const shooter of playerWithShoot) {
                const ballSize = - BALL_CONFIG.BASE_SIZE / 4;
                const startX = shooter.currentPos.x + ballSize;
                const startY = shooter.currentPos.y + ballSize;
                const endX = shooter.shotTarget!.x + ballSize;
                const endY = shooter.shotTarget!.y + ballSize;

                const steps = 30; 
                const trajectory: { x: number, y: number, s: number }[] = [];

                // Parámetros del arco
                const maxHeight = 40; // Cuántos píxeles sube la pelota hacia "arriba" (negativo en Y)
                const baseScale = 1;
                const peakScale = 1.8;

                for (let i = 0; i <= steps; i++) {
                    const t = i / (steps + 1);

                    // 1. Posición base lineal (donde estaría la pelota si fuera plana)
                    const baseX = startX + (endX - startX) * t;
                    const baseY = startY + (endY - startY) * t;

                    // 2. Cálculo de la parábola (va de 0 a 1 y vuelve a 0)
                    const arcFactor = 4 * t * (1 - t);

                    // 3. Aplicamos el arco a la Y (restamos porque en pantalla "arriba" es menos Y)
                    const yConArco = baseY - (maxHeight * arcFactor);

                    // 4. Aplicamos el escalado
                    const s = baseScale + (peakScale - baseScale) * arcFactor;

                    trajectory.push({ x: baseX, y: yConArco, s: s });
                }

                trajectories.push({ id: shooter.player.id + '-shoot' , trajectory });
            }
        }

        const movementPromise = trajectoriesMovement.length > 0 ? this.animateMovementPlayer(trajectoriesMovement) : Promise.resolve();
        const ballPromise = trajectories.length > 0 ? this.animateBallsAlongTrajectories(trajectories) : Promise.resolve();

        await Promise.all([movementPromise, ballPromise]);

        // Actualizar posiciones de jugadores
        /*this.playersOnCourt.update(curr => curr.map(p => p.targetPos ? { ...p, initialPos: { ...p.currentPos }, currentPos: { ...p.targetPos } } : p));*/
    }

    private async animateBallsAlongTrajectories(trajectories: { id: string, trajectory: { x: number, y: number, s?:number }[] }[]) {
        // Animar todos los balones a lo largo de sus trayectorias
        const maxSteps = Math.max(...trajectories.map(t => t.trajectory.length));

        for (let step = 0; step < maxSteps; step++) {
            const currentPositions: { id: string, x: number, y: number, s: number }[] = [];

            for (const traj of trajectories) {
                if (step < traj.trajectory.length) {
                    currentPositions.push({
                        id: traj.id,
                        x: traj.trajectory[step].x,
                        y: traj.trajectory[step].y,
                        s: traj.trajectory[step].s || 1
                    });
                }
            }

            this.ballPositions.set(currentPositions);
            await new Promise(resolve => setTimeout(resolve, 50)); // 50ms por punto
        }

        // Al final, quitar todos los balones animados
        this.ballPositions.set([]);
    }

    private async animateMovementPlayer(trajectories: { id: string, trajectory: { x: number, y: number }[] }[]) {
        const maxSteps = Math.max(...trajectories.map(t => t.trajectory.length));

        this.playersOnCourt.update(curr => curr.map(p => {
            return { ...p, initialPos: { ...p.currentPos } };
        }));

        for (let step = 0; step < maxSteps; step++) {
            const currentPositions: { id: string, x: number, y: number }[] = [];

            for (const traj of trajectories) {
                if (step < traj.trajectory.length) {
                    currentPositions.push({
                        id: traj.id,
                        x: traj.trajectory[step].x,
                        y: traj.trajectory[step].y,

                    });
                    this.playersOnCourt.update(curr => curr.map(p => {
                        if(p.player.id === traj.id) {
                            return { ...p, currentPos: { x: traj.trajectory[step].x, y: traj.trajectory[step].y } };
                        }
                        return p;
                    }));
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // 50ms por punto

        }
    }

    clearPlayerAction(playerId: string) {
        console.log('Clearing actions for player:', playerId);
        this.playersOnCourt.update(current =>
            current.map(p => p.player.id === playerId ? {
                ...p,
                targetPos: undefined,
                shotTarget: undefined,
                passTargetId: undefined,
                isDribble: false,
                isBlock: false
            } : p)
        );
        this.propagateChanges();
    }
}