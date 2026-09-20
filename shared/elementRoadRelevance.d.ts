export interface RoadRelevance {
  /** נתיב הנסיעה (base_routes.id) שעליו האלמנט שולט */
  route_id: number;
  /** הנתיב החוצה. null = האלמנט אינו בצומת אלא באמצע הנתיב */
  cross_route_id: number | null;
}

export function parseRoadRelevance(value: unknown): RoadRelevance[];
export function hasRoadRelevance(el: any): boolean;
export function routeSequenceOf(waypoints: any[] | null | undefined): number[];
/** `null` = אין הצהרה (או אין רצף נתיבים) - הקורא ממשיך בכלל הגאומטרי */
export function elementAppliesToPath(el: any, routeSequence: number[] | null | undefined): boolean | null;
export function relevanceLabel(rel: RoadRelevance, routeNames: Map<number, string> | Record<number, string>): string;
