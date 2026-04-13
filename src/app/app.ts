import { Component, inject } from '@angular/core';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { PlaybookService } from './services/playbook.service';
import { Player } from './models/player.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


import { BALL_CONFIG } from './constants';
import { last } from 'rxjs';

@Component({
    selector: 'app-root', standalone: true, 
    imports: [DragDropModule, CommonModule, FormsModule],
    templateUrl: './app.html', styleUrl: './app.scss'
})

export class App {
    public playbookService = inject(PlaybookService);
    public selectedPlayerId: string | null = null;
    public isAnimating = false;
    public ballToolActive = false;
    public blockToolActive = false;
    public selectedAction: { playerId: string, type: 'movement' | 'pass' | 'shot' } | null = null;

    private readonly DEFAULT_SIZE = 40;
    
    public readonly TRIANGLE_SIZE = 40;
    public readonly ballSize = BALL_CONFIG.BASE_SIZE;
    public readonly HOOP_RADIUS = 24;
    public readonly BOARD_LINE_Y = 395;
    private readonly HOOP_CENTER = { x: 350, y: this.BOARD_LINE_Y - this.HOOP_RADIUS };


    

    onDrop(event: CdkDragDrop<any>) {
        this.playbookService.resetAnimationPositions();
        this.selectedAction = null;
        if (this.isAnimating) return;
        const courtRect = event.container.element.nativeElement.getBoundingClientRect();
        const player = event.item.data as Player;
        if (player) {
            this.playbookService.addOrMovePlayer(player, event.dropPoint.x - courtRect.left, event.dropPoint.y - courtRect.top);
        }
    }

    handlePlayerClick(event: MouseEvent, clickedId: string) {
        this.playbookService.resetAnimationPositions();
        this.selectedAction = null;
        if (this.isAnimating) return;
        event.stopPropagation();
        if (this.ballToolActive) {
            this.playbookService.toggleBall(clickedId);
        } else if (this.blockToolActive) {
            this.selectedPlayerId = (this.selectedPlayerId === clickedId) ? null : clickedId;
        } else {
            // Verificar si el jugador clickeado es receptor de un pase
            const passerWithTarget = this.playbookService.playersOnCourt().find(p => p.passTargetId === clickedId);
            if (passerWithTarget) {
                // Si es receptor de un pase, eliminar el pase
                this.clearPlayerAction(passerWithTarget.player.id);
                return;
            }

            const sel = this.playbookService.playersOnCourt().find(p => p.player.id === this.selectedPlayerId);
            if (sel && sel.hasBall && this.selectedPlayerId !== clickedId) {
                this.clearPlayerAction(this.selectedPlayerId!);
                this.playbookService.setPass(this.selectedPlayerId!, clickedId);
                this.selectedPlayerId = null;
            } else {
                this.selectedPlayerId = (this.selectedPlayerId === clickedId) ? null : clickedId;
            }
        }
    }

    handleClickBall(event: MouseEvent,) {
        this.playbookService.resetAnimationPositions();
        this.selectedAction = null;
        if (this.isAnimating) return;
        if(!this.ballToolActive && this.selectedPlayerId) {
            this.playbookService.toggleBall(this.selectedPlayerId);
        }
        event.stopPropagation();
        this.ballToolActive = !this.ballToolActive;
        this.selectedPlayerId = null;
    }

    // Calcula el punto acortado para que la flecha no se oculte
    onCircleClick(event: MouseEvent, indexPoint: number, playerId: string) {
        this.playbookService.resetAnimationPositions();
        event.preventDefault();
        event.stopPropagation();
        if (this.isAnimating) return;
        this.playbookService.removeMovementPoint(playerId, indexPoint);
    }

    onActionHover(playerId: string, actionType: 'movement' | 'pass' | 'shot', isHovering: boolean) {
        this.playbookService.resetAnimationPositions();
        const element = document.querySelector(`[data-action-id="${playerId}-${actionType}"]`);
        if (element) {
            if (isHovering) {
                element.classList.add('hovered');
            } else {
                element.classList.remove('hovered');
            }
        }
    }

    onCourtClick(event: MouseEvent) {
        // Evitar que se ejecute si el evento viene de un elemento hijo interactivo
        this.playbookService.resetAnimationPositions();
        const target = event.target as HTMLElement;
        if (target.closest('button, [role="button"], svg text')) return;

        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Click derecho (contextmenu event o button 2)
        if (event.button === 2 || event.type === 'contextmenu') {
            event.preventDefault();
            event.stopPropagation();
            if (this.isAnimating || this.blockToolActive) return;
            if (this.selectedPlayerId && !this.playbookService.isBallActive(this.selectedPlayerId)) {
                this.playbookService.setBlock(this.selectedPlayerId, clickX, clickY);
                this.selectedPlayerId = null;
            }
            if (this.selectedAction && this.selectedAction.type === 'movement') {
                this.playbookService.addMovementPoint(this.selectedAction.playerId, clickX, clickY);
                return;
            }
            return;
        }
        this.selectedAction = null;

        // Click izquierdo (button 0)
        if (event.button !== 0) return;

        // Si hay una acción seleccionada (línea resaltada), agregar punto intermedio
        

        // Si se hace click en el fondo del court, deseleccionar acción
        if (target.id === 'court-list' || target === event.currentTarget) {
            this.selectedAction = null;
        }

        if (this.isAnimating || this.ballToolActive || this.blockToolActive) return;
        if (this.selectedPlayerId) {
            const selected = this.playbookService.playersOnCourt().find(p => p.player.id === this.selectedPlayerId);
            if (selected?.hasBall && this.isInsideHoop(clickX, clickY)) {
                this.playbookService.setShot(this.selectedPlayerId, this.HOOP_CENTER.x, this.HOOP_CENTER.y);
                this.selectedPlayerId = null;
                return;
            }

            this.playbookService.setTarget(this.selectedPlayerId, clickX, clickY);
            this.selectedPlayerId = null;
        }
    }

    updateSize(event: any) {
        if (this.selectedPlayerId) {
            this.playbookService.updatePlayerSize(this.selectedPlayerId, +event.target.value);
        }
    }

    resetSize() {
        if (this.selectedPlayerId) {
            this.playbookService.updatePlayerSize(this.selectedPlayerId, this.DEFAULT_SIZE);
        }
    }

    async playFullPlaybook() {
        if (this.isAnimating || this.playbookService.frames().length === 0) return;
        this.selectedPlayerId = null;
        this.ballToolActive = false;
        const framesCount = this.playbookService.frames().length;
        for (let i = 0; i < framesCount; i++) {
            this.playbookService.loadFrame(i);
            await new Promise(r => setTimeout(r, 100));
            this.isAnimating = true;
            await this.playbookService.startAnimationStep();
            this.isAnimating = false;
        }
    }

    private isInsideHoop(x: number, y: number) {
        const dx = x - this.HOOP_CENTER.x;
        const dy = y - this.HOOP_CENTER.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.HOOP_RADIUS;
    }

    getShortenedLine(x1: number, y1: number, x2: number, y2: number, targetSize: number) {
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        if (dist === 0) return { x: x2, y: y2 };
        const offset = (targetSize / 2) + 5; // Radio + margen para la punta de flecha
        const ratio = Math.max(0, (dist - offset) / dist);
        return {
            x: x1 + (x2 - x1) * ratio,
            y: y1 + (y2 - y1) * ratio
        };
    }

    getShortenedPoint(x1: number, y1: number, x2: number, y2: number) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ratio = Math.max(0, (dist - this.TRIANGLE_SIZE) / dist);
        return {
            x: x1 + dx * ratio,
            y: y1 + dy * ratio
        };
    }

    getArrowTriangle(x1: number, y1: number, x2: number, y2: number) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const perpX = -uy;
        const perpY = ux;

        const tipX = x2;
        const tipY = y2;
        const baseX = tipX - ux * this.TRIANGLE_SIZE;
        const baseY = tipY - uy * this.TRIANGLE_SIZE;
        const halfWidth = this.TRIANGLE_SIZE * 0.5;

        const point1X = baseX + perpX * halfWidth;
        const point1Y = baseY + perpY * halfWidth;
        const point2X = tipX;
        const point2Y = tipY;
        const point3X = baseX - perpX * halfWidth;
        const point3Y = baseY - perpY * halfWidth;

        return `${point1X},${point1Y} ${point2X},${point2Y} ${point3X},${point3Y}`;
    }

    getDualArrowLines(x1: number, y1: number, x2: number, y2: number) {
        const distHoop = 10;
        const offset = 4;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const perpX = -uy;
        const perpY = ux;

        // Calcular la base del triángulo donde terminan las líneas
        const baseX = x2 - ux * (this.TRIANGLE_SIZE + this.HOOP_RADIUS + distHoop);
        const baseY = y2 - uy * (this.TRIANGLE_SIZE + this.HOOP_RADIUS + distHoop);

        // Generar dos líneas laterales que terminan en la base del triángulo
        const line1Start = { x: x1 + perpX * offset, y: y1 + perpY * offset };
        const line1End = { x: baseX + perpX * offset, y: baseY + perpY * offset };
        const line2Start = { x: x1 - perpX * offset, y: y1 - perpY * offset };
        const line2End = { x: baseX - perpX * offset, y: baseY - perpY * offset };

        // Triángulo que empieza rozando el aro exterior
        const tipX = x2 - ux * (this.HOOP_RADIUS + distHoop) ;
        const tipY = y2 - uy * (this.HOOP_RADIUS + distHoop) ;
        const triangleBaseX = tipX - ux * this.TRIANGLE_SIZE;
        const triangleBaseY = tipY - uy * this.TRIANGLE_SIZE;
        const halfWidth = this.TRIANGLE_SIZE * 0.5;
        const trianglePoints = `${tipX},${tipY} ${triangleBaseX + perpX * halfWidth},${triangleBaseY + perpY * halfWidth} ${triangleBaseX - perpX * halfWidth},${triangleBaseY - perpY * halfWidth}`;

        return {
            line1: { x1: line1Start.x, y1: line1Start.y, x2: line1End.x, y2: line1End.y },
            line2: { x1: line2Start.x, y1: line2Start.y, x2: line2End.x, y2: line2End.y },
            triangle: trianglePoints,
            crossPoint: { x: tipX, y: tipY }
        };
    }

    getDistance(p1: {x: number, y: number}, p2: {x: number, y: number}): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        return Math.sqrt(dx * dx + dy * dy);
    }

    getMovementLine(points: { x: number, y: number }[] = [], playerID: string) {
        if (points.length < 2) return points;
        this.playbookService.updatePlayerMovementPoints(playerID, points);
        return points;
    }

    getMovementBallLine(points: { x: number, y: number }[] = [], playerID: string) {
        if (points.length < 2) return points;
        let allPointsStr = '';
        let medida = 10;


        const nuevaTrayectoria = [];
        nuevaTrayectoria.push({ ...points[0] });

        let distanciaAcumulada = 0;

        for (let i = 0; i < points.length - 1; i++) {
            const pStart = points[i];
            const pEnd = points[i + 1];

            const dx = pEnd.x - pStart.x;
            const dy = pEnd.y - pStart.y;
            const distTramo = Math.sqrt(dx * dx + dy * dy);

            // Determinamos cuánto nos falta para llegar al primer múltiplo de 'medida'
            // en esta nueva sección.
            let avanceEnEsteTramo = (distanciaAcumulada === 0)
                                    ? medida
                                    : medida - distanciaAcumulada;

            while (avanceEnEsteTramo <= distTramo) {
                const t = avanceEnEsteTramo / distTramo;
                nuevaTrayectoria.push({
                    x: pStart.x + dx * t,
                    y: pStart.y + dy * t
                });
                avanceEnEsteTramo += medida;
            }

            // Guardamos lo que sobró al final de este tramo para el siguiente
            // (Distancia total del tramo menos el último avance realizado)
            distanciaAcumulada = (distTramo - (avanceEnEsteTramo - medida));
        }

        // Opcional: Asegurar que el último punto original esté incluido
        const ultimoOriginal = points[points.length - 1];
        nuevaTrayectoria.push({ ...ultimoOriginal });

        let rand = 1;
        for( let i = 0; i < nuevaTrayectoria.length - 2; i++) {
            allPointsStr += this.getCurvePath(nuevaTrayectoria[i].x, nuevaTrayectoria[i].y, nuevaTrayectoria[i + 1].x, nuevaTrayectoria[i + 1].y, 5 , rand);
            rand = -rand
        }

        return allPointsStr;
    }


    getTotalDistance(points: {x: number, y: number}[]): number {
        if (points.length < 2) return 0;

        return points.reduce((acc, currentPoint, index) => {
            if (index === 0) return 0; // No hay distancia que calcular en el primer punto

            const previousPoint = points[index - 1];

            // Usamos Pitágoras para el tramo actual
            const dx = currentPoint.x - previousPoint.x;
            const dy = currentPoint.y - previousPoint.y;
            const segmentDistance = Math.sqrt(dx * dx + dy * dy);

            return acc + segmentDistance;
        }, 0);
    }

    getDynamicZigzag(points: { x: number, y: number }[]) {
        if (points.length < 2) return '';

        const stepSize = 10;
        const amplitude = 5;

        let allPointsStr = '';

        for (let i = 0; i < points.length - 1; i++) {
            const x1 = points[i].x;
            const y1 = points[i].y;
            const x2 = points[i + 1].x;
            const y2 = points[i + 1].y;

            const angle = Math.atan2(y2 - y1, x2 - x1);
            const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

            // Reservar espacio al final para la flecha, pero solo en el último segmento
            const gapAtEnd = (i === points.length - 2) ? this.TRIANGLE_SIZE : 0;
            const effectiveDist = Math.max(0, dist - gapAtEnd);
            const steps = Math.floor(effectiveDist / stepSize);

            if (i === 0) {
                allPointsStr += `${x1},${y1}`;
            }

            for (let j = 1; j <= steps; j++) {
                const t = (j * stepSize) / dist;
                const currX = x1 + (x2 - x1) * t;
                const currY = y1 + (y2 - y1) * t;

                // Pequeñas curvas usando función sinusoidal con mismo número de zigzags
                const numZigzags = steps - 1;
                const frequency = numZigzags / 2; // Para tener el mismo número de ondas
                const offset = Math.sin((j / steps) * Math.PI * frequency) * amplitude;
                const zigX = currX + Math.cos(angle + Math.PI / 2) * offset;
                const zigY = currY + Math.sin(angle + Math.PI / 2) * offset;

                allPointsStr += ` ${zigX},${zigY}`;
            }

            // Punto final del segmento
            if (i === points.length - 2) {
                // Último segmento: añadir punto antes de la flecha
                const preFinalX = x1 + (x2 - x1) * (effectiveDist / dist);
                const preFinalY = y1 + (y2 - y1) * (effectiveDist / dist);
                allPointsStr += ` ${preFinalX},${preFinalY}`;
            } else {
                allPointsStr += ` ${x2},${y2}`;
            }
        }

        return allPointsStr;
    }

    getBlockLine(x1: number, y1: number, x2: number, y2: number, targetPoints: { x: number, y: number }[] = []) {
        // Calcula la dirección principal de la línea
        let dx = x2 - x1;
        let dy = y2 - y1;
        if(targetPoints.length > 0) {
            const lastTarget = targetPoints[targetPoints.length - 1];
            dx = x2 - lastTarget.x;
            dy = y2 - lastTarget.y;
        }
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Vector unitario
        const ux = dx / dist;
        const uy = dy / dist;

        // Vector perpendicular
        const px = -uy;
        const py = ux;

        // Longitud de la línea perpendicular
        const perpLength = 20;

        // Generar dos líneas perpendiculares (arriba y abajo)
        const perp1Start = { x: x2 + px * perpLength, y: y2 + py * perpLength };
        const perp1End = { x: x2 - px * perpLength, y: y2 - py * perpLength };
        const allpoints = [ { x: x1, y: y1 }, ...targetPoints, { x: x2, y: y2 } ];

        return {
            points: allpoints,
            perpendiculars: [
                { x1: perp1Start.x, y1: perp1Start.y, x2: perp1End.x, y2: perp1End.y }
            ]
        };
    }

    getArrowTriangleWithWaypoints(startPos: { x: number, y: number }, targetPos: { x: number, y: number }, waypoints?: { x: number, y: number }[]) {
        // Si hay waypoints, calcular triángulo basado en el último segmento
        if (waypoints && waypoints.length > 0) {
            const lastWaypoint = waypoints[waypoints.length - 1];
            return this.getArrowTriangle(lastWaypoint.x, lastWaypoint.y, targetPos.x, targetPos.y);
        }
        // Si no hay waypoints, usar el segmento directo
        return this.getArrowTriangle(startPos.x, startPos.y, targetPos.x, targetPos.y);
    }

    getCurvePath(x1: number, y1: number, x2: number, y2: number, curvature: number = 40, rand: number = 1) {
        // 1. Hallar el punto medio entre el inicio y el fin
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // 2. Calcular el ángulo de la línea para saber hacia dónde curvar
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // 3. Desplazar el punto medio perpendicularmente para crear el "punto de control"
        // Usamos el ángulo + 90 grados (PI/2)
        const controlX = midX + Math.cos(angle + Math.PI / 2) * curvature * rand;
        const controlY = midY + Math.sin(angle + Math.PI / 2) * curvature * rand;

        // 4. Retornar el string del path: 
        // M = Move to (inicio), Q = Quadratic Curve (punto de control y destino)
        return `M ${x1},${y1} Q ${controlX},${controlY} ${x2},${y2}`;
    }


    selectLine(playerId: string, actionType: 'movement' | 'pass' | 'shot', event?: MouseEvent) {
        event?.stopPropagation();
        this.selectedPlayerId = null;
        this.ballToolActive = false;
        if (this.selectedAction?.playerId === playerId && this.selectedAction?.type === actionType) {
            this.selectedAction = null;
        } else {
            this.selectedAction = { playerId, type: actionType };
        }
    }

    deleteLine(playerId: string, event?: MouseEvent) {
        event?.stopPropagation();
        this.playbookService.clearPlayerAction(playerId);
        this.selectedAction = null;
    }

    addPoint(playerId: string) {
        const player = this.playbookService.playersOnCourt().find(p => p.player.id === playerId);   
    }

    clearPlayerAction(playerId: string) {
        this.playbookService.clearPlayerAction(playerId);
        this.selectedAction = null;
    }
}