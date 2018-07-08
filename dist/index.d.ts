/// <reference types="react" />
import * as React from 'react';
export interface Mesh {
    vertices: Float32Array;
    indices: Uint32Array;
}
export interface LayerSpec {
    decal?: boolean;
    batches: {
        mesh: Mesh;
        instances: Float32Array;
    }[];
}
export default class Monet extends React.Component<{
    width: number;
    height: number;
    viewMatrix: Float32Array;
    perspectiveMatrix: Float32Array;
    layers: LayerSpec[];
    clearColor: [number, number, number, number];
}, {
    glError?: Error | {
        message: string;
    };
}> {
    private canvasRef;
    private loadedMeshes;
    private gl;
    private instancing;
    private shader;
    state: {
        glError?: Error | {
            message: string;
        };
    };
    componentDidMount(): any;
    shouldComponentUpdate(nextProps: any): boolean;
    renderFrame(): void;
    private requestOnGPU(mesh);
    render(): React.DetailedReactHTMLElement<{
        className: string;
    }, HTMLElement> | React.ReactElement<{
        ref: React.RefObject<HTMLCanvasElement>;
        width: number;
        height: number;
    }>;
}
