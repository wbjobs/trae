#ifndef QUANTUM_SIMULATOR_H
#define QUANTUM_SIMULATOR_H

#include <complex>
#include <vector>
#include <Eigen/Dense>

using Complex = std::complex<double>;
using VectorXc = Eigen::VectorXcd;
using MatrixXc = Eigen::MatrixXcd;

class QuantumSimulator {
private:
    int qubitCount;
    int dimension;
    VectorXc stateVector;

    MatrixXc getGateMatrix(const std::string& gateType);
    MatrixXc buildFullGateMatrix(const MatrixXc& singleQubitGate, int targetQubit);

public:
    QuantumSimulator(int qubitCount);
    void reset();
    VectorXc getStateVector();
    int getQubitCount();
    std::vector<double> getProbabilities();

    void applySingleQubitGate(const std::string& gateType, int targetQubit);
    void applyCNOT(int controlQubit, int targetQubit);

    int measure(int qubitIndex);
    int measureAll();

    void applyGroverOracle(int targetState);
    void applyGroverDiffusion();
    void runGroverSearch(int targetState);
};

#endif
