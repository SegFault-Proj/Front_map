export type Point = [number, number];
export type SpaceType = 'INFO' | 'EXHIBITION' | 'FOOD' | 'POPUP' | 'REST' | 'PATH';
export type Wall = { id: string; x1: number; y1: number; x2: number; y2: number };
export type Space = { id: string; name: string; type: SpaceType; polygon: Point[]; congestion?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CLOSED' };
export type MapNode = { id: string; x: number; y: number; kind?: 'ENTRANCE' | 'WAYPOINT' | 'DESTINATION' };
export type Edge = { from: string; to: string; distance: number; zoneId?: string };
export type MapData = { mapId: string; width: number; height: number; spaces: Space[]; walls: Wall[]; nodes: MapNode[]; edges: Edge[] };
