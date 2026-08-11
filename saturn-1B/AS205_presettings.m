%
% AS-205 Guidance Presettings
% from "AS-205 Revised Launch Vehicle Reference Trajectory", NASA-CR-89333 (TN-AP-67-158)
% date January 4, 1967
% (This was not the trajectory flown on the Apollo 7 mission)
%
% Launch from Kennedy LC-34

% orbit inclination (deg)
i_deg = 28.89597

% argument of descending node (deg)
% (relative to the launch meridian)
lambda_0_deg = 102.32900

% cutoff velocity (m/sec)
V_T_mps = 7780.976

% cutoff gravition vector (V-frame, X-Axis)
Xdotdot_VGT_mps2 = -9.251

% cutoff radius (meters)
R_T_m = 6570774.0

% Terminal pitch angle (deg)
Theta_T_deg = 0.000

% A_z_deg - launch azimuth, degrees east of north
A_z_deg = 82.8200

% Geodetic latitude of the launch site (deg)
phi_L_deg = 28.521963

% Geocentric latitude of the launch site (deg) 
phi_L_prime_deg = 28.360795

% Longitude of launch site (deg, east positive)
lambda_L_deg = -80.561141

% Launch space-fixed position (platform location)
R_L_m = 6373385.0

% Roll angle of vehicle (Position 1) at launch (degree east of true north)
% This is valid for Kennedy LC 34
pad_roll_L_deg = 100.0

% Start of Chi-tilde mode (starts the T_3_i is less than of equal to this
% value)
epsilon_2_sec = 15.0

% Value of T_3_i to freeze IGM (epsilon_prime)
epsilon_prime_sec = 3.0

% T_3_i to start building velocity history for S-IVB cutoff
BN_1_sec = 14.4 

% Start computing (M/F)_S
T3_FM_sec = 6.08

% Start IGM
T3_IGM_sec = 30.0

% Thrust decay bias for S-IVB burn
DeltaV_b_mps = 7.2381

% Velocity guard for S-IVB cutoff
V_GRD_mps = 150.0

% Time to entry High Speed Loop (actually T_HSL + DeltaT_b)
T_HSL_sec = 5.0




