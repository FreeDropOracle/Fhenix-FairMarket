pragma circom 2.0.0;

template DemoCircuit() {
    signal input publicValue;
    signal input secret;
    signal output result;

    result <== secret * secret;
    publicValue === result;
}

component main = DemoCircuit();
