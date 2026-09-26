// Phaser 3.90 bundles Query.collides but omits it from its QueryFactory declaration.
declare namespace MatterJS {
  interface QueryFactory {
    collides(body: BodyType, bodies: BodyType[]): { bodyA: BodyType; bodyB: BodyType; normal: { x:number; y:number }; supports: ({ x:number; y:number } | null)[] }[];
  }
}
