import * as React from 'react';
export interface Mesh {
    vertices: Float32Array;
    indices: Uint32Array;
}
export interface ShaderSource {
    fragment: string;
    vertex: string;
}
export interface LayerSpec {
    decal?: boolean;
    shader?: ShaderSource;
    renderOrder: number;
    batches: {
        mesh: Mesh;
        instances: Float32Array;
    }[];
}
export default class Monet extends React.Component<{
    width: number;
    height: number;
    retinaFactor: number;
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
    private loadedInstances;
    private loadedShaders;
    private gl;
    private instancing;
    state: {
        glError?: Error | {
            message: string;
        };
    };
    componentDidMount(): void;
    shouldComponentUpdate(nextProps: any, nextState: any): boolean;
    renderFrame(): void;
    private requestShaderOnGPU;
    private requestMeshOnGPU;
    private requestInstancesOnGPU;
    render(): React.DetailedReactHTMLElement<{
        className: string;
    }, HTMLElement> | React.DetailedReactHTMLElement<{
        ref: React.RefObject<HTMLCanvasElement>;
        width: number;
        height: number;
        style: {
            width: number;
            height: number;
        };
    }, HTMLCanvasElement>;
}
export declare const solidColorShader: {
    vertex: string;
    fragment: string;
};
