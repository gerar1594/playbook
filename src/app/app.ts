import { Component, inject } from '@angular/core';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { PlaybookService } from './services/playbook.service';
import { Player } from './models/player.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


import { BALL_CONFIG } from './constants';

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
        this.selectedAction = null;
        if (this.isAnimating) return;
        const courtRect = event.container.element.nativeElement.getBoundingClientRect();
        const player = event.item.data as Player;
        if (player) {
            this.playbookService.addOrMovePlayer(player, event.dropPoint.x - courtRect.left, event.dropPoint.y - courtRect.top);
        }
    }

    handlePlayerClick(event: MouseEvent, clickedId: string) {
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

    // Calcula el punto acortado para que la flecha no se oculte


    onCourtClick(event: MouseEvent) {
        this.selectedAction = null;
        // Evitar que se ejecute si el evento viene de un elemento hijo interactivo
        const target = event.target as HTMLElement;
        if (target.closest('button, [role="button"], svg text')) return;

        // Click derecho (contextmenu event o button 2)
        if (event.button === 2 || event.type === 'contextmenu') {
            event.preventDefault();
            event.stopPropagation();
            this.selectedAction = null;
            if (this.isAnimating || this.blockToolActive) return;
            if (this.selectedPlayerId) {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                const clickX = event.clientX - rect.left;
                const clickY = event.clientY - rect.top;
                this.playbookService.setBlock(this.selectedPlayerId, clickX, clickY);
                this.selectedPlayerId = null;
            }
            return;
        }

        // Click izquierdo (button 0)
        if (event.button !== 0) return;

        // Si se hace click en el fondo del court, deseleccionar acción
        if (target.id === 'court-list' || target === event.currentTarget) {
            this.selectedAction = null;
        }

        if (this.isAnimating || this.ballToolActive || this.blockToolActive) return;
        if (this.selectedPlayerId) {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;

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
            this.playbookService.startAnimationStep();
            await new Promise(r => setTimeout(r, 1000));
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

    getDynamicZigzag(x1: number, y1: number, x2: number, y2: number) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

        const stepSize = 10;
        const amplitude = 5;

        // 1. IMPORTANTE: Reservamos un espacio al final (p.ej. 10px)
        // para que el triángulo de la flecha tenga espacio sin sobreponerse.
        const gapAtEnd = 10;
        const effectiveDist = Math.max(0, dist - this.TRIANGLE_SIZE);
        const steps = Math.floor(effectiveDist / stepSize);

        let points = `${x1},${y1}`;

        for (let i = 1; i <= steps; i++) {
            // Calculamos t basado en la distancia efectiva (sin el final)
            const t = (i * stepSize) / dist;

            const currX = x1 + (x2 - x1) * t;
            const currY = y1 + (y2 - y1) * t;

            const offset = (i % 2 === 0 ? 1 : -1) * amplitude;

            const zigX = currX + Math.cos(angle + Math.PI / 2) * offset;
            const zigY = currY + Math.sin(angle + Math.PI / 2) * offset;

            points += ` ${zigX},${zigY}`;
        }

        // 2. Antes del punto final real, añadimos un punto en la línea recta
        // Esto asegura que la flecha esté perfectamente alineada con el ángulo original.
        const preFinalX = x1 + (x2 - x1) * (effectiveDist / dist);
        const preFinalY = y1 + (y2 - y1) * (effectiveDist / dist);

        points += ` ${preFinalX},${preFinalY}`;

        return points;
    }

    getBlockLine(x1: number, y1: number, x2: number, y2: number) {
        // Calcula la dirección principal de la línea
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) return { mainLine: { x1, y1, x2, y2 }, perpendiculars: [] };
        
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
        
        return {
            mainLine: { x1, y1, x2, y2 },
            perpendiculars: [
                { x1: perp1Start.x, y1: perp1Start.y, x2: perp1End.x, y2: perp1End.y }
            ]
        };
    }

    clearPlayerAction(playerId: string) {
        this.playbookService.clearPlayerAction(playerId);
        this.selectedAction = null;
    }

    selectLine(playerId: string, actionType: 'movement' | 'pass' | 'shot', event?: MouseEvent) {
        event?.stopPropagation();
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

    onActionHover(playerId: string, actionType: 'movement' | 'pass' | 'shot', isHovering: boolean) {
        const element = document.querySelector(`[data-action-id="${playerId}-${actionType}"]`);
        if (element) {
            if (isHovering) {
                element.classList.add('hovered');
            } else {
                element.classList.remove('hovered');
            }
        }
    }

    getCurvePath(x1: number, y1: number, x2: number, y2: number, curvature: number = 40) {
        // 1. Hallar el punto medio entre el inicio y el fin
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // 2. Calcular el ángulo de la línea para saber hacia dónde curvar
        const angle = Math.atan2(y2 - y1, x2 - x1);

        // 3. Desplazar el punto medio perpendicularmente para crear el "punto de control"
        // Usamos el ángulo + 90 grados (PI/2)
        const controlX = midX + Math.cos(angle + Math.PI / 2) * curvature;
        const controlY = midY + Math.sin(angle + Math.PI / 2) * curvature;

        // 4. Retornar el string del path: 
        // M = Move to (inicio), Q = Quadratic Curve (punto de control y destino)
        return `M ${x1},${y1} Q ${controlX},${controlY} ${x2},${y2}`;
    }

    addPoint(playerId: string) {
        const player = this.playbookService.playersOnCourt().find(p => p.player.id === playerId);   
    }
}