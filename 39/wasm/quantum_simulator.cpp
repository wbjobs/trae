#include "quantum_simulator.h"
#include <cmath>
#include <stdexcept>
#include <algorithm>

using namespace Eigen;

QuantumSimulator::QuantumSimulator(int qubitCount) : qubitCount(qubitCount) {
    if (qubitCount < 1 || qubitCount > 12) {
        throw std::invalid_argument("Qubit count must be between 1 and 12");
    }
    dimension = 1 << qubitCount;
    reset();
}

void QuantumSimulator::reset() {
    stateVector = VectorXc::Zero(dimension);
    stateVector(0) = Complex(1.0, 0.0);
}

VectorXc QuantumSimulator::getStateVector() {
    return stateVector;
}

int QuantumSimulator::getQubitCount() {
    return qubitCount;
}

std::vector<double> QuantumSimulator::getProbabilities() {
    std::vector<double> probs(dimension);
    for (int i = 0; i < dimension; i++) {
        probs[i] = std::norm(stateVector(i));
    }
    return probs;
}

MatrixXc QuantumSimulator::getGateMatrix(const std::string& gateType) {
    MatrixXc gate(2, 2);
    
    if (gateType == "H") {
        gate << Complex(1.0 / M_SQRT2, 0), Complex(1.0 / M_SQRT2, 0),
                Complex(1.0 / M_SQRT2, 0), Complex(-1.0 / M_SQRT2, 0);
    } else if (gateType == "X") {
        gate << Complex(0, 0), Complex(1, 0),
                Complex(1, 0), Complex(0, 0);
    } else if (gateType == "Y") {
        gate << Complex(0, 0), Complex(0, -1),
                Complex(0, 1), Complex(0, 0);
    } else if (gateType == "Z") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(-1, 0);
    } else if (gateType == "T") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(std::cos(M_PI / 4), std::sin(M_PI / 4));
    } else if (gateType == "S") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(0, 1);
    } else if (gateType == "TDG") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(std::cos(-M_PI / 4), std::sin(-M_PI / 4));
    } else if (gateType == "SDG") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(0, -1);
    } else if (gateType == "I") {
        gate << Complex(1, 0), Complex(0, 0),
                Complex(0, 0), Complex(1, 0);
    } else {
        throw std::invalid_argument("Unknown gate type: " + gateType);
    }
    
    return gate;
}

MatrixXc QuantumSimulator::buildFullGateMatrix(const MatrixXc& singleQubitGate, int targetQubit) {
    MatrixXc result = MatrixXc::Identity(1, 1);
    
    for (int i = 0; i < qubitCount; i++) {
        if (i == targetQubit) {
            result = kroneckerProduct(result, singleQubitGate).eval();
        } else {
            MatrixXc identity = MatrixXc::Identity(2, 2);
            result = kroneckerProduct(result, identity).eval();
        }
    }
    
    return result;
}

void QuantumSimulator::applySingleQubitGate(const std::string& gateType, int targetQubit) {
    if (targetQubit < 0 || targetQubit >= qubitCount) {
        throw std::invalid_argument("Invalid target qubit");
    }
    
    MatrixXc gate = getGateMatrix(gateType);
    int targetMask = 1 << (qubitCount - 1 - targetQubit);
    
    VectorXc newState = VectorXc::Zero(dimension);
    
    for (int i = 0; i < dimension; i++) {
        int targetBit = (i & targetMask) ? 1 : 0;
        int otherBits = i & ~targetMask;
        
        for (int row = 0; row < 2; row++) {
            int targetIndex = otherBits | (row << (qubitCount - 1 - targetQubit));
            Complex element = gate(row, targetBit);
            newState(targetIndex) += element * stateVector(i);
        }
    }
    
    stateVector = newState;
}

void QuantumSimulator::applyCNOT(int controlQubit, int targetQubit) {
    if (controlQubit == targetQubit) {
        throw std::invalid_argument("Control and target qubits must be different");
    }
    if (controlQubit < 0 || controlQubit >= qubitCount) {
        throw std::invalid_argument("Invalid control qubit");
    }
    if (targetQubit < 0 || targetQubit >= qubitCount) {
        throw std::invalid_argument("Invalid target qubit");
    }
    
    VectorXc newState = stateVector;
    
    int controlMask = 1 << (qubitCount - 1 - controlQubit);
    int targetMask = 1 << (qubitCount - 1 - targetQubit);
    
    for (int i = 0; i < dimension; i++) {
        if (i & controlMask) {
            int flippedIndex = i ^ targetMask;
            if (i < flippedIndex) {
                std::swap(newState(i), newState(flippedIndex));
            }
        }
    }
    
    stateVector = newState;
}

int QuantumSimulator::measure(int qubitIndex) {
    if (qubitIndex < 0 || qubitIndex >= qubitCount) {
        throw std::invalid_argument("Invalid qubit index");
    }
    
    int mask = 1 << (qubitCount - 1 - qubitIndex);
    double probability0 = 0.0;
    
    for (int i = 0; i < dimension; i++) {
        if (!(i & mask)) {
            probability0 += std::norm(stateVector(i));
        }
    }
    
    double random = (double)rand() / RAND_MAX;
    int result = random < probability0 ? 0 : 1;
    
    double normalizationFactor = result == 0 ? std::sqrt(probability0) : std::sqrt(1 - probability0);
    
    for (int i = 0; i < dimension; i++) {
        int bitValue = (i & mask) ? 1 : 0;
        if (bitValue != result) {
            stateVector(i) = Complex(0, 0);
        } else {
            stateVector(i) /= normalizationFactor;
        }
    }
    
    return result;
}

int QuantumSimulator::measureAll() {
    std::vector<double> probs = getProbabilities();
    double random = (double)rand() / RAND_MAX;
    double cumulative = 0.0;
    
    for (int i = 0; i < dimension; i++) {
        cumulative += probs[i];
        if (random <= cumulative) {
            stateVector = VectorXc::Zero(dimension);
            stateVector(i) = Complex(1.0, 0.0);
            return i;
        }
    }
    
    stateVector = VectorXc::Zero(dimension);
    stateVector(dimension - 1) = Complex(1.0, 0.0);
    return dimension - 1;
}

void QuantumSimulator::applyGroverOracle(int targetState) {
    if (targetState < 0 || targetState >= dimension) {
        throw std::invalid_argument("Invalid target state");
    }
    stateVector(targetState) = -stateVector(targetState);
}

void QuantumSimulator::applyGroverDiffusion() {
    Complex mean = stateVector.mean();
    
    for (int i = 0; i < dimension; i++) {
        stateVector(i) = 2.0 * mean - stateVector(i);
    }
}

void QuantumSimulator::runGroverSearch(int targetState) {
    reset();
    
    for (int i = 0; i < qubitCount; i++) {
        applySingleQubitGate("H", i);
    }
    
    int iterations = (int)(M_PI / 4.0 * std::sqrt(dimension));
    
    for (int i = 0; i < iterations; i++) {
        applyGroverOracle(targetState);
        applyGroverDiffusion();
    }
}
