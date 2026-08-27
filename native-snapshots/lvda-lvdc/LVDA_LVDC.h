#ifndef LVDA_LVDC_H
#define LVDA_LVDC_H
#include <stdint.h>
#include <stdbool.h>
#include <math.h>

/*
 * Subsystem / host model parameters
 * Source blocks reference PARAM_<name>; bare #define omitted on name collisions
 */
#define PARAM_i_deg 31.605
#define PARAM_lambda_0_deg 119
#define PARAM_V_T_mps 7780.67
#define PARAM_Xdotdot_VGT_mps2 -9.15
#define PARAM_R_T_m 6600405
#define PARAM_Theta_T_deg 0
#define PARAM_A_z_deg 72
#define PARAM_phi_L_deg 28.521963
#define PARAM_phi_L_prime_deg 28.360795
#define PARAM_lambda_L_deg -80.561141
#define PARAM_R_L_m 6373385
#define PARAM_pad_roll_L_deg 100
#define PARAM_epsilon_2_sec 15
#define PARAM_epsilon_prime_sec 5
#define PARAM_BN_1_sec 14.4
#define PARAM_T3_FM_sec 5
#define PARAM_T3_IGM_sec 25
#define PARAM_DeltaV_b_mps 7.2381
#define PARAM_V_GRD_mps 150
#define PARAM_T_HSL_sec 5
#define PARAM_T10_sec 286.3
#define PARAM_A0_sec 0
#define PARAM_A1 0
#define PARAM_Tr1 1.8
#define PARAM_Tr2 0
#define PARAM_Tr3 0
#define PARAM_T2_sec 0
#define PARAM_delta_T_sec 1.6
#define PARAM_tau_1_i_preset_sec 286.3
#define PARAM_tau_3_i_preset_sec 159.8
#define PARAM_tau_3_preset_sec 326.5
#define PARAM_V_ex1_mps 4151
#define PARAM_V_ex3_mps 4233.2
#define PARAM_PC0_sec 0
#define PARAM_tau_1_0_sec 536
#define PARAM_C_0_sec 35
#define PARAM_Mdot_1_kg_per_sec 239.7877
#define PARAM_Mdot_3_kg_per_sec 183.1797
#define PARAM_m_liftoff_kg 585943
#define PARAM_m_separation_kg 138709.90752311
#define PARAM_M1_kg 585943
#define PARAM_M02_kg 129761.6
#define PARAM_M03_kg 134374
#define PARAM_Mdot_2_sib_kg_per_sec 2820.8
#define PARAM_F1_N 7600000
#define PARAM_F2_N 995355.2
#define PARAM_F3_N 775441.26
#define PARAM_mu_earth 398600441800000
#define PARAM_R_earth_m 6371000
#define PARAM_omega_E_rps 0.00002321

#ifdef __cplusplus
extern "C" {
#endif

/* Subsystem input signals */
typedef struct {
    double Theta_deg[3]; /* Input port: Theta_deg */
    double V_m_bar_mps[3]; /* Input port: V_m_bar_mps */
    bool bSIBPropellantSensorDry; /* Input port: bSIBPropellantSensorDry */
    bool bLiftoff; /* Input port: bLiftoff */
    double MES_DCM[3][3]; /* Input port: MES_DCM */
    double PAD_Ve_mps[3]; /* Input port: PAD_Ve_mps */
    double PAD_Xe_m[3]; /* Input port: PAD_Xe_m */
    double S_IVB_Ve_mps[3]; /* Input port: S_IVB_Ve_mps */
    double S_IVB_Xe_m[3]; /* Input port: S_IVB_Xe_m */
    double Ve_mps[3]; /* Input port: Ve_mps */
    double Xe_m[3]; /* Input port: Xe_m */
    bool bLiftoff__tag; /* Input port: bLiftoff__tag */
} LVDA_LVDC_inputs_t;

/* Subsystem output signals */
typedef struct {
    double R_S_bar_m[3]; /* Output port: R_S_bar_m */
    double Psi_deg[3]; /* Output port: Psi_deg */
    bool bSIVEngineStart; /* Output port: bSIVEngineStart */
    bool bSIVCutoff; /* Output port: bSIVCutoff */
    bool bIECO; /* Output port: bIECO */
    bool bSimulinkSIVBEnable; /* Output port: bSimulinkSIVBEnable */
    bool bOECO; /* Output port: bOECO */
    bool bUllageMotorStart; /* Output port: bUllageMotorStart */
    bool bSIVBurn; /* Output port: bSIVBurn */
    bool bSIVCoast; /* Output port: bSIVCoast */
    bool bSwitchpoin5; /* Output port: bSwitchpoin5 */
    bool bSIBStageSep; /* Output port: bSIBStageSep */
    double T1_sec; /* Output port: T1_sec */
    double theta_deg[3]; /* Output port: theta_deg */
} LVDA_LVDC_outputs_t;

/* Internal signal values */
typedef struct {
    double _15_3[3];
    bool Compare_To_Zero;
    double Constant2;
    bool Cutoff_Enable;
    double D_A_Converter_Quantization[3];
    bool IECO_2;
    bool IGM_Enable_3;
    bool J_2_Engine_Start_3;
    double LVDC_Chi_command_angles_Time_Tilt__0_T_S2;
    double LVDC_Chi_command_angles_Time_Tilt_Angle_Conversion;
    bool LVDC_Chi_command_angles_Time_Tilt_Compare_To_Constant;
    double LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read;
    double LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read1;
    double LVDC_Chi_command_angles_Time_Tilt_Data_Store_Read2;
    double LVDC_Chi_command_angles_Time_Tilt_F_1;
    double LVDC_Chi_command_angles_Time_Tilt_F_2;
    double LVDC_Chi_command_angles_Time_Tilt_F_3;
    double LVDC_Chi_command_angles_Time_Tilt_Mux[3];
    double LVDC_Chi_command_angles_Time_Tilt_Mux1[3];
    double LVDC_Chi_command_angles_Time_Tilt_P_final;
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs1[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Difference_Inputs2[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Saturation_Dynamic[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_fall_limit[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_delta_rise_limit[3];
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_sample_time;
    bool LVDC_Chi_command_angles_Time_Tilt_Relational_Operator;
    bool LVDC_Chi_command_angles_Time_Tilt_Relational_Operator1;
    bool LVDC_Chi_command_angles_Time_Tilt_Relational_Operator2;
    bool LVDC_Chi_command_angles_Time_Tilt_Relational_Operator3;
    double LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_0;
    double LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_1;
    double LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_Demux_2;
    double LVDC_Chi_command_angles_Time_Tilt_Switch;
    double LVDC_Chi_command_angles_Time_Tilt_Switch1;
    double LVDC_Chi_command_angles_Time_Tilt_Switch2;
    double LVDC_Chi_command_angles_Time_Tilt_Switch3;
    double LVDC_Chi_command_angles_Time_Tilt_Switch5;
    double LVDC_Chi_command_angles_Time_Tilt_T_S1_sec;
    double LVDC_Chi_command_angles_Time_Tilt_T_S1_sec1;
    double LVDC_Chi_command_angles_Time_Tilt_T_S2_sec;
    double LVDC_Chi_command_angles_Time_Tilt_T_S3_sec;
    double LVDC_Chi_command_angles_Time_Tilt_Unary_Minus[3];
    double LVDC_Chi_command_angles_Time_Tilt_chi_rate_limit[3];
    double LVDC_Chi_command_angles_Time_Tilt_yaw_command;
    double LVDC_Chi_command_angles_Time_Tilt_zero;
    double LVDC_Chi_to_Psi_Transformation_Angle_Conversion2[3];
    double LVDC_Chi_to_Psi_Transformation_Demux_0;
    double LVDC_Chi_to_Psi_Transformation_Demux_1;
    double LVDC_Chi_to_Psi_Transformation_Demux_2;
    double LVDC_Chi_to_Psi_Transformation_Demux1_0;
    double LVDC_Chi_to_Psi_Transformation_Demux1_1;
    double LVDC_Chi_to_Psi_Transformation_Demux2_0;
    double LVDC_Chi_to_Psi_Transformation_Demux2_1;
    double LVDC_Chi_to_Psi_Transformation_Gain1[2];
    double LVDC_Chi_to_Psi_Transformation_Mux[3];
    double LVDC_Chi_to_Psi_Transformation_Product10;
    double LVDC_Chi_to_Psi_Transformation_Product3;
    double LVDC_Chi_to_Psi_Transformation_Product4;
    double LVDC_Chi_to_Psi_Transformation_Product5;
    double LVDC_Chi_to_Psi_Transformation_Product6;
    double LVDC_Chi_to_Psi_Transformation_Product7;
    double LVDC_Chi_to_Psi_Transformation_Product8;
    double LVDC_Chi_to_Psi_Transformation_Selector[2];
    double LVDC_Chi_to_Psi_Transformation_SinCos_sin[2];
    double LVDC_Chi_to_Psi_Transformation_SinCos_cos[2];
    double LVDC_Chi_to_Psi_Transformation_Sum1[3];
    double LVDC_Chi_to_Psi_Transformation_Sum2[3];
    double LVDC_Chi_to_Psi_Transformation_Sum3;
    double LVDC_Chi_to_Psi_Transformation_Sum4;
    double LVDC_Chi_to_Psi_Transformation_Sum5;
    double LVDC_Iterative_Guidance_Mode__45_degree_limit;
    double LVDC_Iterative_Guidance_Mode_Add;
    double LVDC_Iterative_Guidance_Mode_Add1;
    double LVDC_Iterative_Guidance_Mode_Add10[3];
    double LVDC_Iterative_Guidance_Mode_Add11;
    double LVDC_Iterative_Guidance_Mode_Add12;
    double LVDC_Iterative_Guidance_Mode_Add13;
    double LVDC_Iterative_Guidance_Mode_Add14;
    double LVDC_Iterative_Guidance_Mode_Add15;
    double LVDC_Iterative_Guidance_Mode_Add2;
    double LVDC_Iterative_Guidance_Mode_Add3;
    double LVDC_Iterative_Guidance_Mode_Add4;
    double LVDC_Iterative_Guidance_Mode_Add5;
    double LVDC_Iterative_Guidance_Mode_Add6;
    double LVDC_Iterative_Guidance_Mode_Add7;
    double LVDC_Iterative_Guidance_Mode_Add8;
    double LVDC_Iterative_Guidance_Mode_Add9;
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion;
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion1;
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion2;
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion3[2];
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion5;
    double LVDC_Iterative_Guidance_Mode_Angle_Conversion6;
    bool LVDC_Iterative_Guidance_Mode_Compare_To_Constant;
    bool LVDC_Iterative_Guidance_Mode_Compare_To_Constant2;
    bool LVDC_Iterative_Guidance_Mode_Compare_To_Constant3;
    double LVDC_Iterative_Guidance_Mode_Constant;
    double LVDC_Iterative_Guidance_Mode_Constant1;
    double LVDC_Iterative_Guidance_Mode_Constant10;
    double LVDC_Iterative_Guidance_Mode_Constant11;
    double LVDC_Iterative_Guidance_Mode_Constant12;
    double LVDC_Iterative_Guidance_Mode_Constant13;
    double LVDC_Iterative_Guidance_Mode_Constant3;
    double LVDC_Iterative_Guidance_Mode_Constant4;
    double LVDC_Iterative_Guidance_Mode_Constant5;
    double LVDC_Iterative_Guidance_Mode_Constant6;
    double LVDC_Iterative_Guidance_Mode_Constant7;
    double LVDC_Iterative_Guidance_Mode_Data_Store_Read;
    double LVDC_Iterative_Guidance_Mode_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_Data_Store_Read2;
    double LVDC_Iterative_Guidance_Mode_Data_Store_Read3;
    double LVDC_Iterative_Guidance_Mode_DeltaT_N_sec;
    double LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant;
    double LVDC_Iterative_Guidance_Mode_DeltaT_b_Constant1;
    double LVDC_Iterative_Guidance_Mode_DeltaT_b_Divide;
    double LVDC_Iterative_Guidance_Mode_DeltaT_b_Sum;
    double LVDC_Iterative_Guidance_Mode_Demux_0;
    double LVDC_Iterative_Guidance_Mode_Demux_1;
    double LVDC_Iterative_Guidance_Mode_Demux1_0;
    double LVDC_Iterative_Guidance_Mode_Demux1_1;
    double LVDC_Iterative_Guidance_Mode_Demux1_2;
    double LVDC_Iterative_Guidance_Mode_Demux2_0;
    double LVDC_Iterative_Guidance_Mode_Demux2_1;
    double LVDC_Iterative_Guidance_Mode_Demux2_2;
    double LVDC_Iterative_Guidance_Mode_Demux3_0;
    double LVDC_Iterative_Guidance_Mode_Demux3_1;
    double LVDC_Iterative_Guidance_Mode_Demux3_2;
    double LVDC_Iterative_Guidance_Mode_Demux4_0;
    double LVDC_Iterative_Guidance_Mode_Demux4_1;
    double LVDC_Iterative_Guidance_Mode_Demux4_2;
    double LVDC_Iterative_Guidance_Mode_Demux4_3;
    double LVDC_Iterative_Guidance_Mode_Demux5_0;
    double LVDC_Iterative_Guidance_Mode_Demux5_1;
    double LVDC_Iterative_Guidance_Mode_Divide;
    double LVDC_Iterative_Guidance_Mode_Divide1;
    double LVDC_Iterative_Guidance_Mode_Divide2;
    double LVDC_Iterative_Guidance_Mode_Divide3;
    double LVDC_Iterative_Guidance_Mode_Divide4;
    double LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add8[3];
    double LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Add9[3];
    double LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Gain[3];
    double LVDC_Iterative_Guidance_Mode_Estimated_Velocity_to_be_gained_Product12[3];
    bool LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant;
    bool LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Compare_To_Constant1;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Constant1;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Data_Store_Read2;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Ground;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Sum;
    double LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_Switch;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Constant1;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Data_Store_Read2;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Gain2;
    bool LVDC_Iterative_Guidance_Mode_IGM_First_Phase_If2;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Mux2[4];
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_First_BML_of_Phase_2;
    double LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Sum4;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add1;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add2;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add3;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add4;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add5;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add6;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add7;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Add8;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide1;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide2;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide3;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide4;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide5;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide6;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Divide7;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain1;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain2;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain3;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain5;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Gain6;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function1;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Math_Function2;
    double LVDC_Iterative_Guidance_Mode_IGM_Intermediate_Parameters_Polynomial;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Constant3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Data_Store_Read5;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Divide2;
    bool LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_If1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Mux2[4];
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Product4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_HSL_mode_ON;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract5;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract6;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Subtract7;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Sum;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_T_HSL;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Constant1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Data_Store_Read5;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Gain1;
    bool LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If1;
    bool LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_If2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Mux2[4];
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_HSL_mode_ON;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_nHSLActive_ON;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_terminal_steering_mode_ON;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Subtract3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Sum;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_T_HSL_sec;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_epsilon_2_from_EDD;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Add1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant5;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Constant6;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Data_Store_Read4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Divide3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Gain;
    bool LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_If2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_M_GR1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Math_Function;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Mux2[4];
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Product;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_artifical_tau_complete;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Subtract4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Add1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant5;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Constant6;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Data_Store_Read4;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Divide3;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Gain;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_M_GR1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Math_Function;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Mux2[4];
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Phase_2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Product;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract1;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract2;
    double LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_Subtract3;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add10;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add11;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Add12;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Divide2;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain1;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Gain5;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Math_Function[3];
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Product13;
    double LVDC_Iterative_Guidance_Mode_Improved_Estimate_of_Total_time_to_go_Sum_of_Elements;
    bool LVDC_Iterative_Guidance_Mode_Logical_Operator;
    bool LVDC_Iterative_Guidance_Mode_Logical_Operator1;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__11;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__12;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__13;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__21;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__22;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__23;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__31;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__32;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform__33;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux[2];
    double LVDC_Iterative_Guidance_Mode_M4V_Transform_Mux2[3][3];
    double LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_sin;
    double LVDC_Iterative_Guidance_Mode_M4V_Transform_SinCos_cos;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion1;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Angle_Conversion2[3];
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_Mux[3];
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__11;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__12;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__13;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__21;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__22;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__23;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__31;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__32;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix__33;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_0;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_1;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Demux_2;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux[8];
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_Mux2[3][3];
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_sin;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos_cos;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_sin;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos1_cos;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_sin;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos2_cos;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_sin;
    double LVDC_Iterative_Guidance_Mode_MS4_Transform_Matrix_S_Frame_to_4_Frame_MS4_matrix_SinCos3_cos;
    double LVDC_Iterative_Guidance_Mode_Math_Function;
    double LVDC_Iterative_Guidance_Mode_Math_Function1;
    double LVDC_Iterative_Guidance_Mode_Math_Function2;
    double LVDC_Iterative_Guidance_Mode_Math_Function3;
    double LVDC_Iterative_Guidance_Mode_Math_Function4[3];
    double LVDC_Iterative_Guidance_Mode_Math_Function5[3][3];
    double LVDC_Iterative_Guidance_Mode_Math_Function6;
    double LVDC_Iterative_Guidance_Mode_Math_Function7;
    double LVDC_Iterative_Guidance_Mode_Memory1;
    double LVDC_Iterative_Guidance_Mode_Memory2;
    double LVDC_Iterative_Guidance_Mode_Multiport_Switch[4];
    double LVDC_Iterative_Guidance_Mode_Mux[3];
    double LVDC_Iterative_Guidance_Mode_Mux1[3];
    bool LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Compare_To_Constant;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Ground;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add12;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add13;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add14;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add15;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add16;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add17;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Add3;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Divide1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Gain5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Math_Function5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product13;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product14;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product15;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product16;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product17;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product3;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product4;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product6;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product7;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Product8;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_Selector2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_sin;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_1_K_3_K_4_Eqns_4_4_51_67_SinCos_cos;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add10;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add3;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add4;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add6;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add7;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add8;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Add9;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Constant;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Divide1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Gain5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Math_Function5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Polynomial;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product10;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product11;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product12;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product13;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product14;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product15;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product16;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product17;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product18;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product19;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product3;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product4;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product6;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product7;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product8;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Product9;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector3;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector4;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_Selector5;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_sin;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos_cos;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_sin;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Position_Correction_Terms_part_2_K_1_K_2_Eqns_4_4_68_80_SinCos1_cos;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch1;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch2;
    double LVDC_Iterative_Guidance_Mode_Position_Correction_Terms_Switch3;
    double LVDC_Iterative_Guidance_Mode_Product;
    double LVDC_Iterative_Guidance_Mode_Product1;
    double LVDC_Iterative_Guidance_Mode_Product10[3];
    double LVDC_Iterative_Guidance_Mode_Product11[3];
    double LVDC_Iterative_Guidance_Mode_Product12[3];
    double LVDC_Iterative_Guidance_Mode_Product13;
    double LVDC_Iterative_Guidance_Mode_Product14;
    double LVDC_Iterative_Guidance_Mode_Product15[3];
    double LVDC_Iterative_Guidance_Mode_Product16;
    double LVDC_Iterative_Guidance_Mode_Product17;
    double LVDC_Iterative_Guidance_Mode_Product2;
    double LVDC_Iterative_Guidance_Mode_Product3;
    double LVDC_Iterative_Guidance_Mode_Product4;
    double LVDC_Iterative_Guidance_Mode_Product5;
    double LVDC_Iterative_Guidance_Mode_Product6[3];
    double LVDC_Iterative_Guidance_Mode_Product7[3];
    double LVDC_Iterative_Guidance_Mode_Product8[3];
    double LVDC_Iterative_Guidance_Mode_Product9[3];
    double LVDC_Iterative_Guidance_Mode_SMCY_Add17;
    double LVDC_Iterative_Guidance_Mode_SMCY_Add19;
    double LVDC_Iterative_Guidance_Mode_SMCY_Add20;
    double LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last;
    double LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2;
    double LVDC_Iterative_Guidance_Mode_SMCY_Constant9;
    double LVDC_Iterative_Guidance_Mode_SMCY_Divide6;
    double LVDC_Iterative_Guidance_Mode_SMCY_Gain1;
    double LVDC_Iterative_Guidance_Mode_SMCY_Product18;
    double LVDC_Iterative_Guidance_Mode_SMCY_Product19;
    double LVDC_Iterative_Guidance_Mode_SMCY_SMCG_Y_Axis;
    double LVDC_Iterative_Guidance_Mode_SMCY_SMCY;
    double LVDC_Iterative_Guidance_Mode_SMCY_Sum2;
    double LVDC_Iterative_Guidance_Mode_SMCY_Sum5;
    double LVDC_Iterative_Guidance_Mode_SMCY_Trigonometric_Function6;
    double LVDC_Iterative_Guidance_Mode_SMCY_pirads_to_radians;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Add16;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Add18;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Constant8;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Divide5;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Divide7;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Gain;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Math_Function8;
    double LVDC_Iterative_Guidance_Mode_SMCZ_SMCG;
    double LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ;
    double LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_sin;
    double LVDC_Iterative_Guidance_Mode_SMCZ_SinCos2_cos;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Sum3;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Sum4;
    double LVDC_Iterative_Guidance_Mode_SMCZ_pirads_to_radians;
    double LVDC_Iterative_Guidance_Mode_Selector[2];
    double LVDC_Iterative_Guidance_Mode_Selector1[2];
    double LVDC_Iterative_Guidance_Mode_SinCos_sin;
    double LVDC_Iterative_Guidance_Mode_SinCos_cos;
    double LVDC_Iterative_Guidance_Mode_SinCos1_sin;
    double LVDC_Iterative_Guidance_Mode_SinCos1_cos;
    double LVDC_Iterative_Guidance_Mode_Subtract;
    double LVDC_Iterative_Guidance_Mode_Sum;
    double LVDC_Iterative_Guidance_Mode_Sum_of_Elements1;
    double LVDC_Iterative_Guidance_Mode_Sum1;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function1;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function2;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function3;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function4;
    double LVDC_Iterative_Guidance_Mode_Trigonometric_Function5;
    double LVDC_Iterative_Guidance_Mode_Unary_Minus;
    double LVDC_Iterative_Guidance_Mode_Unary_Minus1;
    double LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_0;
    double LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_1;
    double LVDC_Iterative_Guidance_Mode_Vector_Display2_Demux5_2;
    double LVDC_Iterative_Guidance_Mode_XYZdot_VT_mps[3];
    double LVDC_Iterative_Guidance_Mode_XYZdotdot_VT_mps2[3];
    double LVDC_Iterative_Guidance_Mode_const_;
    bool LVDC_Iterative_Guidance_Mode_epsilon_prime;
    double LVDC_Iterative_Guidance_Mode_loop[3];
    bool LVDC_Iterative_Guidance_Mode_Switch_Case_case_0;
    bool LVDC_Iterative_Guidance_Mode_Switch_Case_case_1;
    bool LVDC_Iterative_Guidance_Mode_Switch_Case_case_2;
    bool LVDC_Iterative_Guidance_Mode_Switch_Case_case_3;
    bool LVDC_Iterative_Guidance_Mode_Switch_Case_case_4;
    bool LVDC_Iterative_Guidance_Mode_SMCZ_enable_bool;
    bool LVDC_Iterative_Guidance_Mode_SMCY_enable_bool;
    double LVDC_S_Frame_Position_Velocity_Calculations__0_25_sec_2_m;
    double LVDC_S_Frame_Position_Velocity_Calculations_Az_deg;
    double LVDC_S_Frame_Position_Velocity_Calculations_Constant4;
    double LVDC_S_Frame_Position_Velocity_Calculations_Constant5;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12__2J;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add1[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Add2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Angle_Conversion1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Constant1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Divide2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Math_Function;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux[7];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1[7];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux2[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_P_34;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product1[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Product2[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_3;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_R_m;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_34;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_S_term;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos1_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_SinCos2_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_X;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Y_G;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_aaa;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_0;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux_expand_0_demux_900119_2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_0;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Estimated_Gravitational_Acceleration_Eqns_4_3_6_12_Mux1_expand_0_demux_900124_2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Add;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Angle_Conversion2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn3;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn4;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Fcn5;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux[9];
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux1[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_Mux2[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos1_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos2_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos3_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_sin;
    double LVDC_S_Frame_Position_Velocity_Calculations_Initial_Position_and_Velocity_Eqns_3_4_3_4_SinCos4_cos;
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Gain3[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function3;
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Math_Function4[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product18[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Product6[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Sum_of_Elements1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch1[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch2[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch3[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Switch5[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_R_L;
    double LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11__0_25_sec_2_m;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFK[8];
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Math_Function5;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Mux1[8];
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Product1[8];
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_Sum_of_Elements;
    bool LVDC_S_Frame_Position_Velocity_Calculations_T3_FM;
    double LVDC_S_Frame_Position_Velocity_Calculations_phi_L_deg;
    double LVDC_S_Frame_Position_Velocity_Calculations_phi_L_prime_deg;
    bool Logical_Operator;
    bool Logical_Operator1;
    bool Logical_Operator2;
    bool Logical_Operator3;
    bool Logical_Operator4;
    bool Logical_Operator5;
    bool Logical_Operator6;
    bool Memory;
    bool OECO_2;
    bool OECO_2_141_5;
    bool Orbit_Mode;
    double Rate_Limiter[3];
    bool Stage_Sep_3;
    double T1_Timer_Clock;
    double T1_Timer_Constant;
    double T1_Timer_Data_Store_Read;
    double T1_Timer_Sum;
    double T1_Timer_Switch;
    bool T1_Timer_Timer_Initialization_enable_bool;
    double T2_Timer_Clock;
    double T2_Timer_Constant;
    double T2_Timer_Data_Store_Read;
    double T2_Timer_Sum;
    double T2_Timer_Switch;
    bool T2_Timer_Timer_Initialization_enable_bool;
    double T3_Timer_Clock;
    double T3_Timer_Constant;
    double T3_Timer_Data_Store_Read;
    double T3_Timer_Sum;
    double T3_Timer_Switch;
    bool T3_Timer_Timer_Initialization_enable_bool;
    double T4_Timer_Clock;
    double T4_Timer_Constant;
    double T4_Timer_Data_Store_Read;
    double T4_Timer_Sum;
    double T4_Timer_Switch;
    bool T4_Timer_Timer_Initialization_enable_bool;
    bool Ullage_Ignition_3;
} LVDA_LVDC_signals_t;

/* State variables */
typedef struct {
    double LVDC_Chi_command_angles_Time_Tilt_Rate_Limiter_Dynamic_Delay_Input2_state[3];
    double LVDC_Iterative_Guidance_Mode_Memory1_state;
    double LVDC_Iterative_Guidance_Mode_Memory2_state;
    double LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last_state;
    double LVDC_Iterative_Guidance_Mode_SMCY_Chi_y_last2_state;
    double LVDC_Iterative_Guidance_Mode_SMCY_SMCY_state;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last_state;
    double LVDC_Iterative_Guidance_Mode_SMCZ_Chi_z_last2_state;
    double LVDC_Iterative_Guidance_Mode_SMCZ_SMCZ_state;
    double LVDC_Iterative_Guidance_Mode_loop_state[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Position_and_Velocity_Calculation_S_Frame_Eqns_4_3_1_5_Memory2_state[3];
    double LVDC_S_Frame_Position_Velocity_Calculations_Rate_Limiter_0_005_last_output;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF2_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF3_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MF4_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS1_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS2_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS3_state;
    double LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_MFS4_state;
    double Memory_state;
    double Rate_Limiter_last_output[3];
} LVDA_LVDC_states_t;

/* Subsystem-local data stores (synced with parent when shared) */
typedef struct {
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_X_deg */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Y_deg */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_Chi_Z_deg */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCY_rad */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nHSLActive */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nIGMMode */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_SMCZ_rad */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_3_i_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_DeltaT_b_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_T_1_i_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_1_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nTerminalSteeringMode; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_nTerminalSteeringMode */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_P_C_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_alpha_f */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_LVDC_Iterative_Guidance_Mode_tau_3_N_sec */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_T1_Timer_A */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_T2_Timer_A */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_T3_Timer_A */
    double Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A; /* data store: Saturn_Instrument_Unit_IU_LVDA_LVDC_T4_Timer_A */
} LVDA_LVDC_data_stores_t;

/* Nested Action/Enable scopes inside this segregated module */
typedef struct {
    int LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles_enabled; /* Enable state for LVDC_Chi_command_angles_Time_Tilt_Store_Chi_Command_Angles */
    int LVDC_Iterative_Guidance_Mode_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode */
    int LVDC_Iterative_Guidance_Mode_DeltaT_b_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_DeltaT_b */
    int LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_HSL_Cutoff_Timing */
    int LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Chi_Steering */
    int LVDC_Iterative_Guidance_Mode_IGM_First_Phase_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_First_Phase */
    int LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_First_Phase_Set_nIGMMode_to_1 */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_HSL_first_pass_Set_HSL_Mode */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_HSL_Mode */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_complete_Set_Terminal_Steering_Mode */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_artificial_tau_mode_Set_nIGMMode_to_3 */
    int LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_IGM_Phase2_first_BML */
    int LVDC_Iterative_Guidance_Mode_SMCY_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_SMCY */
    int LVDC_Iterative_Guidance_Mode_SMCZ_enabled; /* Enable state for LVDC_Iterative_Guidance_Mode_SMCZ */
    int LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11_enabled; /* Enable state for LVDC_S_Frame_Position_Velocity_Calculations_Reciprocal_Acceleration_Filter_EDD_eqn_4_2_11 */
    int T1_Timer_Timer_Initialization_enabled; /* Enable state for T1_Timer_Timer_Initialization */
    int T1_Timer_Timer_Initialization_trig_prev; /* Previous trigger for rising-edge T1_Timer_Timer_Initialization */
    int T2_Timer_Timer_Initialization_enabled; /* Enable state for T2_Timer_Timer_Initialization */
    int T2_Timer_Timer_Initialization_trig_prev; /* Previous trigger for rising-edge T2_Timer_Timer_Initialization */
    int T3_Timer_Timer_Initialization_enabled; /* Enable state for T3_Timer_Timer_Initialization */
    int T3_Timer_Timer_Initialization_trig_prev; /* Previous trigger for rising-edge T3_Timer_Timer_Initialization */
    int T4_Timer_Timer_Initialization_enabled; /* Enable state for T4_Timer_Timer_Initialization */
    int T4_Timer_Timer_Initialization_trig_prev; /* Previous trigger for rising-edge T4_Timer_Timer_Initialization */
} LVDA_LVDC_enable_states_t;

/* Main subsystem structure for LVDA_LVDC */
typedef struct {
    LVDA_LVDC_inputs_t inputs;
    LVDA_LVDC_outputs_t outputs;
    LVDA_LVDC_signals_t signals;
    LVDA_LVDC_states_t states;
    LVDA_LVDC_data_stores_t data_stores;
    LVDA_LVDC_enable_states_t enable_states;
    double time; /* Simulation time (synced from parent) */
    double dt; /* Time step (synced from parent) */
    unsigned long long sample_tick; /* Synced from parent (multi-rate hits) */
    int enabled; /* Enable state: 1=enabled, 0=disabled */
} LVDA_LVDC_t;

/*
 * Function prototypes
 */
/* Initialize subsystem to default state */
void LVDA_LVDC_init(LVDA_LVDC_t* model);
/* Compute outputs from inputs and states (algebraic evaluation) */
void LVDA_LVDC_compute_outputs(LVDA_LVDC_t* model);
/* Update nested Action/Enable scopes inside this module */
void LVDA_LVDC_evaluate_enable_states(LVDA_LVDC_t* model);

#ifdef __cplusplus
}
#endif

#endif /* LVDA_LVDC_H */
