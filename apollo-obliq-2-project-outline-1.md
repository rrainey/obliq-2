# The Apollo/Obliq-2 project

The goal of this project is to use the obliq-2 environment to build a drop-in replacement for an existing Simulink/RTW-based Apollo/Saturn IB launch simulation.

Phase 1 - Translate the existing AS-205 Simulation MDL simulation to an functionally equivalent obliq-2 model.
1.1 Identify gaps or missing functionality in obliq-2 to permit something close to a block for block translation of the existing model
1.2 verify simulation results by logging obliq-2 results and comparing with the data from a complete run of the existing simulation: `/home/riley/src/viper/ApolloA/reference-1000s.csv` (extra supporting software cited below).

Phase 1 Exit Criteria: less than 0.5% difference in final results in final simulation output state.

Phase 2 - Switch to as-flown Apollo 7 flight parameters. Rerun both simulations and compare simulations results of the two simulations.

Phase 2 Exit Criteria: less than 0.5% difference in final results in final simulation output state.

Phase 3 - Compare the published Apollo 7 NASA Launch Reference Trajectory with the obliq-2 results from Phase 2.  Identify discrepancies - starting early in the flight and working progressively to the end of the reference simulations run. Identify and correct modeling discrepancies along the way.

Phase 3 Exit Criteria: < 0.5% difference between the two simulations in all modeled outputs.

Phase 4 - Integrate obliq-2 generated C-code for the model into the more complex ApolloA simulation (details below).

Phase 4 Exit Criteria: the generated obliq-2 model C-code correctly runs as a replacement for the original Simulink model.


## Resources

~/src/obliq-2/ - Current obliq-2 code along with select Saturn technical artifacts
~/src/viper/ApolloA/ - Source code to the human in the loop Apollo/Saturn IB AGC/FDAI simulation
~/src/viper/batch-sim/ - Source code to the batch execution version of the Apollo/Saturn IB AGC/FDAI simulation
~/src/viper/lib_SaturnIB/ - Simulink/RTW generated C-language model and C++ wrapper components
~/src/viper/dso_core/ - a C++ utility simulation and simulation math support library
~/src/viper/dso_fs/ - a C++ utility flight simulation library based on dso_core
