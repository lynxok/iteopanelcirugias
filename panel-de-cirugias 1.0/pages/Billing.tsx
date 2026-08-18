import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { HospitalAdmission, Patient, HospitalMedicationLog, UserRole } from '../types';
import { format, differenceInHours, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Tooltip, ComposedChart, Line } from 'recharts';

interface BillingAdmission extends HospitalAdmission {
    patient: Patient;
    room_name?: string;
    bed_code_val?: string;
    meds_count?: number;
    surgery?: any;
    medication_logs?: HospitalMedicationLog[];
}

// Fila enriquecida para la planilla de internaciones
interface PlanillaRow {
    admission_id: string;
    surgery_id: string | null;
    fecha: string; // check_in date
    fechaRaw: string;
    profesional: string;
    paciente: string;
    cobertura: string;
    fe_factur: string;
    fe_aoter: string;
    nro_hc: string;
    nuc: string;
    dni: string;
    is_guardia?: boolean;
    patient_id?: string;
}

// Usamos la ruta absoluta del logo en base64
const logoIteo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnMAAAFECAYAAABMJ7iGAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAADVYSURBVHhe7d0JmI31+8fxe2aYMfZtkH3f9+yVJSJFSWhRaFERQrJFWYqULaXSYl+SQhIiJVmyRWTf930bzMaM//k+v1v/FMKcc+Z5nvN+/a655nvfR7/LNc6c8znP812CLnsIAAAAHClYvwMAAMCBCHMAAAAORpgDAABwMMIcAACAgxHmAAAAHIwwBwAA4GCEOQAAAAcjzAEAADgYmwbbyL6jJ2XXoWNaOVOFovkkdXgKrQAAgK8R5myiz5jp0nfcDK2cK1WKMJk/uJtUK1lIOwAAwJe4zWoTU3/+TUfOdiEmVqYvXqUVAADwNcKcTVy8FK8j54uJu6gjAADga4Q5AAAAB3P0nLmYtb9L3JatErdjh1zcuVMuHjoo8SdPSsLp0xJ/6pQEpU4tIRkySEjGjJIsSxZJXqCAhJqvQoUlRfnyEpw2rf4/Jb2CT74qOx2++OGKlxvVkQ87ttQKAAD4kqPCXNz27RI5ZYpEL18mMb//LpdjY/WR2xNatKiEV6kqqR94QFLVravdpEGYAwAAt8MRt1kjJ06UfbXvlT0VK8ipoUM8YW55ooOcEbdli5wdO0YONmsqu4oVlRP9+sml/fv1UQAAAPuzbZi7HBMjpz/6SHYWLSJH2r0sMWvW6CO+cenwYSso7ipXVo62bycX9+zRRwAAAOzLlmHu7PjxsqtkCTnes4fEHzmiXT+5dEnOTpggu8uWkaMdX5GEM2f0AQAAAPuxVZiL3bJF9t1bS452aC/xJ05oN+mcHTtWdpcvJ5GTJmkHAADAXmwT5k6PHCl7777LWthgJ2ZV7JGX28qBJo9K/OnT2gUAALCHJA9zCefOycEnHpfjr/e0bnHaVdSPP8realUl2sdz9wAAAG5Fkoa5uF27ZG/1e+TC3LnasTezSGJ/vbpy5vPPtAMAAJC0kizMRS1ZIvtqVJeLu3drxyEuXZJjXbrI4RdfkMtxcdoEAABIGkkS5sw+cQcefsi6xepU56ZOtW4PX05I0A4AAID/+T3MxW7aJAeaNhGJd/7B8lELF8rRDh20AgAA8D+/hjkz5+zAQw3l8vnz2nG+yIkT5NSQwVoBAAD4l9/C3OWLF+XQ00/ZYv84bzvRv79cWPSzVgAAAP7jtzB3vHt3iVm9Wiv3OdyihcQ5bTEHAABwPL+EuailS+XMF59r5U4JkZFy5PnntAIAAPAPn4e5y/HxcqxzJ63cLWbNGjn3zddaAQAA+J7Pw9zZ0V9I3NatWrnfsZ49JSE2VisAAADf8mmYS4iOlhMDB2oVGOKPHpUzH3+kFQAAgG/5NMyd/fxzSTh1SqvAcWrYMElw0fYrAADAvnwW5sxVuZPDhmoVWBLOnpUzoz7RCgAAwHd8FubOf/ttQF6Vu+L0xx9biz8AAAB8yWdhLnLKZB0FJrM5ctTPP2kFAADgGz4Jc+bYrqhfftEqcEV+OVVHAAAAvuGTMHduxgwdBbbz38/WEQAAgG/4JMxF/cTtReNydLREL1miFQAAgPd5PcxdvnRJohZzi/WKqMWLdQQAAOB9Xg9zsWvWyOW4OK0QtWypjgAAALzP+2Fu8yYdwYjbxM8DAAD4jtfDXCCdw3oz4k+dkvjISK0AAAC8y/thbscOHeGKiwRcAADgI14Pc5eOn9ARrrh07JiOAAAAvMvrYe7yBQ6Y/6eEc+d0BAAA4F1eD3MJ5wlz/5QQeVZHAAAA3uX9K3McLv8vl2PZqgUAAPiG18NccMpUOsIVQSnDdQQAAOBd3g9zqVLqCFcEp06jIwAAAO/yfphLQ3D5p+DUqXUEAADgXV4Pc8my59ARrkieK5eOAAAAvMvrYS55/vw6whXJixTREQAAgHd5PcyFFiigIxgh2bJJcFiYVgAAAN7l9TAXVrKkjmCkKFlKRwAAAN7n/StzJUpIcPr0WiFl9eo6AgAA8D6vh7mg4GBJec89WiFlzZo6AgAA8D6vhzkjVe3aOgpsIZkzS1jp0loBAAB4n0/CXOpHHhFJlkyrwJW2WTMdAQAA+IZPwlxIuvSSpuFDWgWutE88qSMAAADf8EmYM9K1bKGjwBRavLiElWIlKwAA8C2fhbmUNWtJWOkyWgWejK901BEAAIDv+CzMGZm6dtVRYEmeL5+kadpUKwAAAN/xaZhL3aBBQN5qzNyzp7VFCwAAgK/5PHFkGTJUR4EhxZ13SpqmrGIFAAD+4fMwF16pkqRr2VIrl0ueXLJ9+pkWAAAAvueXe4ERfftJSNasWrmXub0aWqCAVgAAAL7nlzBnzmq944vRWrlTiipVJEPHTloBAAD4h99m6ae8+27J0LatVu4SnC6dZB83XoKCgrQDAADgH34Lc0bEgIGSolIlrdzDBLlkAXAbGQAA2I9fw5yR46uvrH3Y3CLbqE8lZc2aWgEAAPiX38NcSPoMkuu72RKSLZt2nCtzn76S9rHHtAIAAPA/v4c5I1nOnJL7hx8kWe482nEes39exo4c2QUAAJJWkoQ5I3mevJJ74UIJLVJEOw4RHCx3jB0r6Z97ThsAAABJJ8nCnJEsIkJy/7hQUtWvrx17M3vl5fphvqRp9Ih2AAAAklaShjkjOE0ayTHlS4kY+I4n3SXTrv2krFVL8q5YIeEVK2oHAAAg6SV5mLsiQ5s2kmfJUklRvrx27CEkUybJ+sGHknPGTGvxBgAAgJ3YJswZYUWLSu6ffpasIz6wxfFf6Vo9I/nWrJF0Tz+tHQAAbs756Bg5cuqM7Dh4VNbt2CtLNmyVRWs3//V1LipG/ySQOEGXPXRsL5cuyfk5c+TM6C8katEibfpe8rx5rRBnApy5KucvBZ98VXYeOqaVs73cqI582LGlVgDgHheiY2XLvkOy7cAR2ekJaVv3H5b9x07J2QtRnvAW6wlo0db3CzGx+l9c36pR/aRCEefvu3q8Zw85O2GCJJw7px3nMBeOMrbvIBnatdOOM9k3zP3NpX375My4cXJ20kSJP3JEu94TFBoqqR94UNK1bCEpa9byNPx/LBdhDgDs48DxU/L7tj2yea8nuHkCm7m6ZoLb0dOR+icSzw1hLm7bNtlTydlzyc3c/QI7d1lZwKkcEeb+zlyli162TKJXrpDoVavk8oUL+sitCStZUsKrVpNwz5Mw1X11JTh9en0kaRDmgKvFxF2U3YePy54jx//6vuvQcc+b6VmJjo2zHr/y/cpXlKe+ltxZMknurJkkR+YMkidrZsmWKZ1kz5RBsntq08ufPYv+SQSqQydOy0+/b5LF67dYt0C3e8Kbr7khzJ2fNUsOtXD+VKS8K1dJaOHCWjmH48LcP5mrdnG7dkrcjh1y6eAhiT99yvN1WhLOnJGg8HAJyZBBQjJmlGRZskry/PkltGBBCS1WTP9r+yDMIZCt2rJL1m7fa80rWr9zn/W7cOTUWX3UPwp4Al35wnmlSvGCUrFofutNNjzMuZ/UcWPHTkfKwt83yi/rNlshzh/h7Z8Ic/ZBmINXEOYQKMwk8L/Cm+drw+4D+oj9lM6fy3qztcKdBjw4l7lVOm7erzLj19Wycc9B7SYdwpx9EObgFYQ5uNXhk2dkzm/rZO6K9bJg9QaJdPAKvpRhoXJP6SJS586SUqdCCSlTILcEJcEcW9y8U5HnZfKPy2XigqWyYvNO7doDYc4+CHPwCsIc3GTxH1vkh5Ub5HtPiPtj5z7tuk+G1CnlgSplpdHdd3q+l5GUKcL0ESS13zbtkJEzFnhC3DLt2A9hzj6cHuZstc8cAOcyAe6FwV9IxgYvSo1X3pYBk2a5OsgZp89HyaQfl0nTPh9Iqvufl4d7DpWJ85daCzOQNCZ5wlvFF9+Qqm372jrIAd5EmANw23YdOibdR02VPM06WgHus9mLrIATqGYtWytPD/hEcjzaXrp+MkX2Hzupj8CXTHgePm2e9XN/6u2PZfXW3foIEBgIcwBuSXx8gsz8dY3U6zLImh4waMps2UdouYoJtO99OUdye0LuI72Gy6/rt+oj8CZzgsJgz8/ZfJjoNHKSHDp5Rh8BAgthDl7n7y0l4B9mIUPfsTMkz2OegNJ7uMxf/acw4fa/zVyyRqp3eEvKPve6tZISiRd5IVr6jfM8F5u9Iq99MkWOn3XeyQOANyXJAoi12/fI8TPnpG7FUtpxnoPHT1sr81rVr66dxHHTAgijY5N60qBqOQkJtt/nhUI5s0mOiAxa4b8sXLNRPv52oXyzeJV2kBhZM6SVlx6qLW0b1ZEsnjFunglxI775QYZ+NdcVt/NZAGEfrGa9RebTffZH21vj+yuVlmHtmkvR3Nmt2gnMuXxvT/xWBk76zqpfaFBLRnV51honhtvCnN293/4p6fBoPa1wLfNXbZBuo76UdTvcvYghKbWoe7d0efwBKZU/l3ZwPW+NnymDp86Rs55A5xaEOftgNestMufdXTFv5Xop1qKbPPPOp9ZmjnZ21vMp8B1PgMv/ROe/gpxhdqyH80yYv1RH+Cdz5bxWxwFS77V3CXI+Nn7+Ein9bE+5t9MA+W7ZWu3i775etFLyPtZReo/+xlVBDvAmW9wDGzvvVynUvIs06D5Eflm3Rbv2YEJm+/fHyx2N20mPz76SY2e8d8gyko45xxNX27rvsDVZv3zr3rJo3Wbtwh9+XrtZHuo5VO5u10/WsBLT8ofng4T5eZhtX/YeZYENcCN+D3M3uqtrNhit2fFtydW0g3T5aHKSvaiZA5fNCqkKL/S2QuaHMxZI9HXe/BPYcxkOZ+Z/mqvjJVp1sybrI+ks/XO7tUdaiwGfWFNSAlGs57X21ZGTPR8qelk/DwD/ze9h7maOvjngeXMZ8tVcqeB5UTNhygS7H1au10d9w+xLNGDiLKnWtq/kaNLBWiG1ZtseffT6gjnKx5H4dxM5fe6CtBs+TnJ6PjyZq+PxCXwwsQPzr2CmARR4orP1mhRIzBYuJVp1l6HT5vJBGbgFfl8AsXLzTqncpo9WtyZFaHKpUaao1CpXXIrnzSHF8mSXgjmy6qM3z3zi3bz3kGzac9A68sVM9L7dpe0Vi+STlaP6aXX7WADhXyXz5ZQNYwZqFXjMLvmdR05i2oADmPNfx3RvLeUK5dWO+5yPjpGun3xprZoOJCyAsA9Ws96iVVt2SaWX3tTKO8oWzC1ZM6STNClTSNqU4Z7v4ZIuVbhciIm1NpWMjIq2vpsDlzftPejVSbSViuaXFZ/01er2Eeb8K1DD3N4jJ6wjt8wecXCOkOAg6dysvvR95lEJDwvVrjus2LRTHu/3oezxPDcDDWHOPghztygxV+bsyPwiml/IxCLM+VeghTlzasOQr+ZYm/5GcW6oY+XNllkmvt5G7irl3DedK8wipJ6ffSXvf/1DwN5SJczZB1uTALA1Mx+03POvS7dRUwlyDmeuXt3dvr90GDHe0Yf5/7n7gJRs1V2GTZvH3DjACwhzgEuZDa7Nm37ll96UDZ43T7jHB9MXSImW3W23ldPNmPPbOqnatg93IgAvIswhILl9NevyjdulaIvXrDd9rny40+4jx6V25wEybNpc7djfu1NmS8MeQ+W854MGAO8hzCEguTngDJk6xzrY3WzxA3cz28l0HjlZWg4YpR37Mn9Hc6ufDxeA9xHmAJcwK7Yf7jlUunw8RS7FJ2gXgcAcC1b2uddtudGwOQrxnvb9rb8jAN8gzAEusGHXfinzbE+ZxfmeAeuPnfusQGfO1rWLfUdPWltRLdmwTTsAfIEwBzjc57MXWW+YZg4VApvZBLray/3kWxscy2aOY7zzhV6y7cAR7QDwFcIc4FBma4rm/T+S1oO/sPbsAgzzXGjUa7i1p2BSMafqmFurJ86e1w4AXyLMISA5fTXrrkPHrKtxkxcu1w5wtT5jp0urgf5fGDFx/lKp99q7Es0HDMBvCHMISE5eUbdkw1ap8EJva+NV4EbG/bBEnnrrY0lI8M/z/cPpC6TFgE+0AuAvhDnAQb5cuFzu7ThQTp+P0g5wY5N+XCYtB/o+YL0z6TtpP2K8sPEI4H+EOcAh3hj9jTzR/yO5GB+vHeDmTFywzKdX6MbOXSw9PvtKKwD+RphDQHLajLknPSGu//iZWgG3zlyha/XOKLns5SkGs5etlefe/VwrAEmBMIeA5JRbQRcvxcsD3d6TKSx0gBdMmL9UXhwyWqvEW7R2szz6xvuc6gAkMcIcYFOxcRelftd3Ze6K9doBEu+z2Yuk/fvjtbp9f+zYJw92Hyxxng8cAJIWYQ6wIbOH3H2vDpKFv2/SDuA9H85YIG+O/karW2eODav32iCJ8jxPASQ9whwCkp3nzEXFxHqC3Dvy64at2gG8r9/4mfLpdz9rdfPMFeMHuw2Wo6cjtQMgqRHmEJDsOsPH7N5fv+t7svTP7doBfKfN0DEy57d1Wt2clgNHydode7UCYAeEOcAm4i5ekoY9hsji9VyRg3+YhQtN3hghv2+7ucP5h0ydI1N/XqEVALsgzAE2cCk+Xh7pNVx+XLNRO4B/mGO3zPy33YePa+faFqz+U7p8PEUrAHZCmENAstucuWZ9PpA5K/7QCvAvcyB+0zdHWFvhXMuJs+fkyf4jtQJgN4Q5BCQ7zZnr8tFkmfHrGq2ApLFm2x7pPHKSVld7ot9IK/ABsCfCHJCExsxdLEO+mqsVkLTMliXTFl09J+7jbxdy+x+wOcIckER+WbdWWv9nntrC385Dx3Tkr6d/D5k6x5q1OHPpesw+q0P4Z+8n2L015FqRk8mX1+7d9l54CgL582WRlFm9e17D+/t03yE9h53Vzv2cPl23+L3l2vE//g9z1sKAsX2HVs6Ws3p5HRmEOVwXW5MAd/l60UrZd8y57Tz3H+8D7jR15B4dATCIc4AfXfV19v3rLsc/T4aVqX9z5LjvH3c5+i3yO/0X7eHOHHcc0L3z9F2O/yX8TzP07+w/D/w5/l9w/Z/H9D/g/+c/+Y1WwG92H/q3f/LwHfv3l5Hjfs4+uL+P/gX/Nn6P8K9QhDlcy9Dk2eWzB3TWSjlDqvgwWTmsl1buU7pAfvnswexauU+lErllaKeOWrnP0LYt5Km6VbVyH/NhtX6Ph7RyHnN78+n61aUo/1f3lyooG8cN0spZTC1e0+p+vK4C/+Xn4b0le5ZMWsEuzC3eBUN6SuGcHNy/M3O8v0Wc27+L0BTMkUkWTepPmMuGCHPJn2HOVq8X6O3kP83pXqN5k6f/9L1s4v6d+F/j/69r/+Q52/0f/v/H+D3CvzKlc+7fM3PccUB/Ff4f78/xP5e5/s/Z/x8y/034T7s29nCee8vLzC/u0GfDvc9433GnyRszvFfO+5D3B++jZ1+G/3d6H2/33uH9B3+Pvxk+bTz/X45/mJ0R5v4m+LKV/XwV24M/5pWb8X95uP++zH/z20c8/6bW/D/3229qDf8bYc4+CHP2EfgwZx8/rNogG8YNkg3j+sn7g7pb29Rcjzkn0cT75v1B0nbAGPl9xV/W1Qj+H++jZ1+G//M8+rW3/u9f8d9bT2r2/tB/dvyX3G+6p//eP8L/9k8evmP/P582ntt9dGz3v/H2k/49/jZ+23h+J/e/8faT/rf+e4f3HwRmmLMPwpx9BHz3l3//+mHlBvk+98c1/m/660/9r/7T//o/eT7c96T/zX/L+9r8H/+6v7t/hH/bOPln/P39N8P7j4n/E9635f+c94E//+3eG+Z94s87f4b/fL//M/w/42/z3/C/9f/D/4H/7Z+3fW372va17Xtb2/e2v2vf2L/fV2/a29p/+XU13v4R5gD/iY9P8G9cK/dZ/MeWf65GOPbZ9H+ef/vX//6/V//lV7X9k+fDff/a33D/fX/C/Xv9n+9r/h/ubfPeb+1vef/zX//v/P98m/9+w//G/5/+5v/v15a//7u9f4X/bf4f/qfn3+V/bvsZ7m/tX+H+W//nffrP3/fW/uX4n/Xv38+n/wZf94+4LcwF1P/e/+43fL3+z399uP+P/z3+n//9a3/z3/z3/t7+e//2r//2r/3n313/+v/7U+5r//X9t//kOfn1NfaP8P94H+f3x7v/eR60/P/+eD4Y/b/vW/93e8/Rz/F8eL4e/jP8P+P5/9rX+O8r4/+L91Ewfw9wL/Pfn8uHpx3D5D/X5t+/3eP/hP9m1bZ9rn1F55q0YJlP/+bY1Wdf4/v/w/9X/x3+525DmMtW27Y/BwAAAA5DmAMAAHAwwhwAAICDEeYA8C9zQzX+V/g/fM7tH+D/5bL/t4EwB4AXmePZzu5u4u4G/p/f239eF173/U/g2gJtZ/XFzD5p/1H/Mfx3CHMAeInZQ+z8Rff7W3s4z+ve/xU/+2ZfB/5MOHWj969792NfL2e12Nf/7v3n/fvxv329z9wP4OaYw3Xh/45pL1+GOfuIf7s8Lws31Bbm9uT5mX2Y0z+wT3t4f4/+F4E2/25T2v5L5r2/tD12f+9fA1fP68/z/7X/kv7t395/3v/e/N8/vjD/f6/8P72f3//Xfv6f3rv/2Nf/7n8GvP+98n8t/1/7P/l//3j/f3+E89/s6y/zX9r+4z/5D//5T97D/8L9W4Q5ALzEHGQ/eKIXZ0X5Y6e1mX3681kP++L3Yf1e/+V8eJ8J/07X/LvcO+b/R+t0eP/7aB26dY0xYQ5wFcIcAF7iL3vMnd1/0H/xP/lPvO1/+729j7X5v/sV/N+32M7+5d/8//uF+ffO/+G/3W5T2m1KO1v/V2m3Ke02pfv/lXaH99H/4f/9Z8H1//PqU/t31H/4v//D/+23fO0/G1599u/sPxt+Tftn//v/V98v+R9qC3PXzve/18tXfVrfz9Xfe/Zpff3//ff//vP7+/R///r5D/D2hzn7CPB/q0Xf554Qd/HChWznL2c7c/WifO6X8vDypfy7i0g9b41L5tX28N/8P/4P//+P/xveb//hP6F//Xfv3/7Xf+f38//9L7j9U+53x9v/d9z+9u1ff/18X/uG/+v/B9//hP//+f//H/+3/7K98//w37R//h/+v2n/e+H//v/T7c/XG9W997gAAAAABGDsODwAAAABgjzAAAADgYIQ5AAAAB/s/s7Lp+G0jA3MAAAAASUVORK5CYII=";

const Billing = () => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'planilla' | 'pendientes' | 'historial' | 'dashboard'>('planilla');
    const [admissions, setAdmissions] = useState<BillingAdmission[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAdmission, setSelectedAdmission] = useState<BillingAdmission | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const { user } = useAuth();

    // ── Planilla state ──────────────────────────────────────────────
    const [planillaRows, setPlanillaRows] = useState<PlanillaRow[]>([]);
    const [planillaLoading, setPlanillaLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set()); // admission_id set
    const [bulkFeFactur, setBulkFeFactur] = useState('');
    const [bulkFeAoter, setBulkFeAoter] = useState('');
    const [savingBulk, setSavingBulk] = useState(false);
    const [savingRow, setSavingRow] = useState<string | null>(null);
    const [planillaSearch, setPlanillaSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof PlanillaRow; direction: 'asc' | 'desc' } | null>({
        key: 'fecha',
        direction: 'desc'
    });
    const [planillaFilterType, setPlanillaFilterType] = useState<'todos' | 'sin_factur' | 'con_factur' | 'sin_aoter' | 'con_aoter' | 'completas' | 'solo_ambulatorias' | 'solo_internacion'>('todos');
    const [planillaStartDate, setPlanillaStartDate] = useState('');
    const [planillaEndDate, setPlanillaEndDate] = useState('');
    const [planillaBillingStartDate, setPlanillaBillingStartDate] = useState('');
    const [planillaBillingEndDate, setPlanillaBillingEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(100);

    // Modal de estadísticas
    const [statModalData, setStatModalData] = useState<{
        title: string;
        description: string;
        icon: string;
        badgeColor: string;
        rows: PlanillaRow[];
    } | null>(null);
    const [statModalSearch, setStatModalSearch] = useState('');
    // ────────────────────────────────────────────────────────────────

    // Permissions check
    const canManageBilling = ['SuperAdmin', 'Facturacion', 'Administrativo', 'Gerencia', 'Direccion'].includes(user?.role || '');

    useEffect(() => {
        setSearchTerm('');
        if (activeTab === 'planilla' || activeTab === 'dashboard') {
            fetchPlanilla();
        } else {
            fetchAdmissions();
        }
    }, [activeTab]);

    // ── Fetch existentes ─────────────────────────────────────────────
    const fetchAdmissions = async () => {
        try {
            setLoading(true);
            const statusFilter = activeTab === 'pendientes' ? 'pendiente' : 'facturado';

            const { data, error } = await supabase
                .from('hospital_admissions')
                .select(`
                    *,
                    patient:patients(*),
                    bed:hospital_beds(
                        bed_code,
                        room:hospital_rooms(name)
                    )
                `)
                .eq('billing_status', statusFilter)
                .not('check_out', 'is', null)
                .order('check_out', { ascending: false });

            if (error) throw error;

            const transformed: BillingAdmission[] = (data || []).map(adm => ({
                ...adm,
                room_name: adm.bed?.room?.name,
                bed_code_val: adm.bed?.bed_code
            }));

            setAdmissions(transformed);
        } catch (err) {
            console.error('Error fetching billing data:', err);
        } finally {
            setLoading(false);
        }
    };

    // ── Fetch Planilla ───────────────────────────────────────────────
    const fetchPlanilla = async () => {
        try {
            setPlanillaLoading(true);

            // 1. Traer todas las internaciones
            const { data: admData, error: admError } = await supabase
                .from('hospital_admissions')
                .select(`
                    id,
                    patient_id,
                    check_in,
                    check_out,
                    fe_factur,
                    fe_aoter
                `)
                .not('check_in', 'is', null)
                .not('check_out', 'is', null)
                .order('check_in', { ascending: false });

            if (admError) throw admError;

            // 2. Traer todas las cirugías completadas de quirófano O prácticas ambulatorias
            const { data: surgData, error: surgError } = await supabase
                .from('surgeries')
                .select(`
                    id,
                    patient_id,
                    nuc,
                    surgery_date,
                    status,
                    medical_coverage,
                    is_guardia,
                    doctor:doctors!doctor_id(full_name),
                    patient:patients(
                        full_name,
                        document_number,
                        nuc,
                        medical_record_number,
                        insurance_name
                    )
                `)
                .or('status.eq.completed,is_guardia.eq.true')
                .order('surgery_date', { ascending: false });

            if (surgError) throw surgError;

            const rows: PlanillaRow[] = [];
            const assignedAdmissionIds = new Set<string>();

            for (const surgery of (surgData || [])) {
                const surgDate = surgery.surgery_date;
                let searchStart: string | null = null;
                let searchEnd: string | null = null;
                if (surgDate) {
                    const dateStartObj = new Date(surgDate + 'T12:00:00Z');
                    dateStartObj.setUTCDate(dateStartObj.getUTCDate() - 5);
                    searchStart = dateStartObj.toISOString().substring(0, 10);
                    
                    const dateEndObj = new Date(surgDate + 'T12:00:00Z');
                    dateEndObj.setUTCDate(dateEndObj.getUTCDate() + 5);
                    searchEnd = dateEndObj.toISOString().substring(0, 10);
                }

                // Buscar internación vinculada en +- 5 días
                let matchingAdmission = (admData || []).find(adm => {
                    const checkInDateOnly = adm.check_in ? adm.check_in.substring(0, 10) : null;
                    return (
                        adm.patient_id === surgery.patient_id &&
                        checkInDateOnly &&
                        searchStart &&
                        searchEnd &&
                        checkInDateOnly >= searchStart &&
                        checkInDateOnly <= searchEnd &&
                        !assignedAdmissionIds.has(adm.id)
                    );
                }) || null;

                if (matchingAdmission) {
                    assignedAdmissionIds.add(matchingAdmission.id);
                }

                const patient = surgery.patient as any;
                const admissionId = matchingAdmission ? matchingAdmission.id : `no-admission:${surgery.id}`;
                const feFactur = matchingAdmission ? (matchingAdmission.fe_factur || '') : '';
                const feAoter = matchingAdmission ? (matchingAdmission.fe_aoter || '') : '';
                const surgeryDateStr = surgery.surgery_date;

                rows.push({
                    admission_id: admissionId,
                    surgery_id: surgery.id,
                    fecha: surgeryDateStr ? format(parseISO(surgeryDateStr), 'dd/MM/yyyy') : '—',
                    fechaRaw: surgeryDateStr || '',
                    profesional: (surgery.doctor as any)?.full_name || '—',
                    paciente: patient?.full_name || '—',
                    cobertura: surgery.medical_coverage || patient?.insurance_name || 'PARTICULAR',
                    fe_factur: feFactur,
                    fe_aoter: feAoter,
                    nro_hc: patient?.medical_record_number || '—',
                    nuc: surgery.nuc || patient?.nuc || '—',
                    dni: patient?.document_number || '—',
                    is_guardia: !!surgery.is_guardia || !!(surgery as any).is_ambulatory || !!(surgery as any).operating_room?.is_ambulatory,
                    patient_id: surgery.patient_id
                });
            }

            setPlanillaRows(rows);
        } catch (err) {
            console.error('Error fetching planilla:', err);
        } finally {
            setPlanillaLoading(false);
        }
    };

    // ── Guardar fecha en fila individual ─────────────────────────────
    const saveRowDate = async (admissionId: string, field: 'fe_factur' | 'fe_aoter', value: string, row?: PlanillaRow) => {
        try {
            setSavingRow(admissionId + field);

            if (admissionId.startsWith('no-admission:')) {
                const patientId = row?.patient_id;
                const surgeryDate = row?.fechaRaw;
                const cleanCheckIn = surgeryDate ? surgeryDate + 'T12:00:00Z' : new Date().toISOString();
                const cleanCheckOut = surgeryDate ? surgeryDate + 'T12:00:00Z' : new Date().toISOString();

                const { data, error } = await supabase
                    .from('hospital_admissions')
                    .insert({
                        patient_id: patientId,
                        check_in: cleanCheckIn,
                        check_out: cleanCheckOut,
                        billing_status: 'pendiente',
                        [field]: value
                    })
                    .select('id')
                    .single();

                if (error) throw error;

                const newAdmId = data.id;

                setPlanillaRows(prev =>
                    prev.map(r => r.admission_id === admissionId ? { 
                        ...r, 
                        admission_id: newAdmId,
                        [field]: value 
                    } : r)
                );
            } else {
                const { error } = await supabase
                    .from('hospital_admissions')
                    .update({ [field]: value })
                    .eq('id', admissionId);
                if (error) throw error;
                setPlanillaRows(prev =>
                    prev.map(r => r.admission_id === admissionId ? { ...r, [field]: value } : r)
                );
            }
        } catch (err) {
            console.error('Error saving date:', err);
            alert('Error al guardar la fecha');
        } finally {
            setSavingRow(null);
        }
    };

    // ── Guardar fechas en lote ────────────────────────────────────────
    const applyBulkDates = async () => {
        if (selectedRows.size === 0) return;
        if (!bulkFeFactur && !bulkFeAoter) {
            alert('Ingresá al menos una fecha para aplicar.');
            return;
        }
        try {
            setSavingBulk(true);
            const updatePayload: any = {};
            if (bulkFeFactur) updatePayload.fe_factur = bulkFeFactur;
            if (bulkFeAoter) updatePayload.fe_aoter = bulkFeAoter;

            const ids = Array.from(selectedRows);
            const realIds = ids.filter(id => !id.startsWith('no-admission:'));
            const virtualIds = ids.filter(id => id.startsWith('no-admission:'));

            if (realIds.length > 0) {
                const { error } = await supabase
                    .from('hospital_admissions')
                    .update(updatePayload)
                    .in('id', realIds);

                if (error) throw error;
            }

            const newIdMapping: Record<string, string> = {};
            for (const vId of virtualIds) {
                const row = planillaRows.find(r => r.admission_id === vId);
                if (row) {
                    const cleanCheckIn = row.fechaRaw ? row.fechaRaw + 'T12:00:00Z' : new Date().toISOString();
                    const cleanCheckOut = row.fechaRaw ? row.fechaRaw + 'T12:00:00Z' : new Date().toISOString();
                    const { data, error } = await supabase
                        .from('hospital_admissions')
                        .insert({
                            patient_id: row.patient_id,
                            check_in: cleanCheckIn,
                            check_out: cleanCheckOut,
                            billing_status: 'pendiente',
                            ...updatePayload
                        })
                        .select('id')
                        .single();

                    if (!error && data) {
                        newIdMapping[vId] = data.id;
                    }
                }
            }

            setPlanillaRows(prev =>
                prev.map(r => {
                    if (selectedRows.has(r.admission_id)) {
                        const newId = newIdMapping[r.admission_id] || r.admission_id;
                        return { ...r, admission_id: newId, ...updatePayload };
                    }
                    return r;
                })
            );
            setSelectedRows(new Set());
            setBulkFeFactur('');
            setBulkFeAoter('');
        } catch (err) {
            console.error('Error bulk saving:', err);
            alert('Error al guardar en lote');
        } finally {
            setSavingBulk(false);
        }
    };

    // ── Helpers ──────────────────────────────────────────────────────
    const calculateDays = (checkIn: string, checkOut: string) => {
        const start = parseISO(checkIn);
        const end = parseISO(checkOut);
        const diffHours = differenceInHours(end, start);
        return Math.max(1, Math.ceil(diffHours / 24));
    };

    const fetchAdmissionDetails = async (admission: BillingAdmission) => {
        try {
            setIsProcessing(true);
            const { data: meds } = await supabase
                .from('hospital_medication_logs')
                .select('*')
                .eq('admission_id', admission.id)
                .order('administered_at', { ascending: true });

            const checkInDate = admission.check_in ? admission.check_in.substring(0, 10) : null;
            let startDateStr = '';
            if (checkInDate) {
                const d = new Date(checkInDate + 'T12:00:00Z');
                d.setUTCDate(d.getUTCDate() - 1);
                startDateStr = d.toISOString().substring(0, 10);
            } else {
                startDateStr = new Date().toISOString().substring(0, 10);
            }
            const endDateStr = admission.check_out 
                ? admission.check_out.substring(0, 10) 
                : new Date().toISOString().substring(0, 10);

            const { data: surgeries } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    doctor:doctors!doctor_id(full_name),
                    anesthesiologist:doctors!anesthesiologist_id(full_name)
                `)
                .eq('patient_id', admission.patient_id)
                .gte('surgery_date', startDateStr)
                .lte('surgery_date', endDateStr)
                .order('surgery_date', { ascending: false })
                .limit(1);

            let surgeryWithForm = surgeries?.[0] || null;
            if (surgeryWithForm) {
                const { data: form } = await supabase
                    .from('surgery_forms')
                    .select('*, surgery_form_items(*)')
                    .eq('surgery_id', surgeryWithForm.id)
                    .maybeSingle();
                if (form) surgeryWithForm = { ...surgeryWithForm, form };
            }

            setSelectedAdmission({
                ...admission,
                medication_logs: meds || [],
                surgery: surgeryWithForm
            });
        } catch (err) {
            console.error('Error fetching details:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    const markAsBilled = async (admissionId: string) => {
        if (!confirm('¿Está seguro de marcar esta intervención como FACTURADA? Pasará al historial.')) return;
        try {
            setIsProcessing(true);
            const { error } = await supabase
                .from('hospital_admissions')
                .update({ billing_status: 'facturado', billed_at: new Date().toISOString(), billed_by: user?.name })
                .eq('id', admissionId);
            if (error) throw error;
            await supabase.from('audit_logs').insert({
                user_name: user?.name, user_role: user?.role, action: 'UPDATE',
                resource: 'hospital_admissions', resource_id: admissionId,
                description: `Enfermería marcada como FACTURADA.`, meta: { billed_by: user?.name }
            });
            setSelectedAdmission(null);
            fetchAdmissions();
        } catch (err) {
            console.error('Error billing:', err);
            alert('Error al facturar');
        } finally {
            setIsProcessing(false);
        }
    };

    const deleteAdmission = async (admissionId: string) => {
        if (!confirm('¿Está seguro de que desea ELIMINAR permanentemente esta internación? Esta acción no se puede deshacer.')) return;
        try {
            setIsProcessing(true);
            const { error } = await supabase
                .from('hospital_admissions')
                .delete()
                .eq('id', admissionId);
            if (error) throw error;
            await supabase.from('audit_logs').insert({
                user_name: user?.name, user_role: user?.role, action: 'DELETE',
                resource: 'hospital_admissions', resource_id: admissionId,
                description: `Internación eliminada por duplicación/error.`
            });
            setSelectedAdmission(null);
            if (activeTab === 'planilla') {
                fetchPlanilla();
            } else {
                fetchAdmissions();
            }
            alert('Internación eliminada con éxito.');
        } catch (err) {
            console.error('Error deleting admission:', err);
            alert('Error al eliminar la internación');
        } finally {
            setIsProcessing(false);
        }
    };

    const filteredAdmissions = admissions.filter(adm => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return true;
        const patientName = String(adm.patient?.full_name || adm.patient?.name || '').toLowerCase();
        const documentNumber = String(adm.patient?.document_number || '').toLowerCase();
        const nuc = String(adm.patient?.nuc || '').toLowerCase();
        return patientName.includes(query) || documentNumber.includes(query) || nuc.includes(query);
    });

    const requestSort = (key: keyof PlanillaRow) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const renderSortIcon = (key: keyof PlanillaRow) => {
        if (!sortConfig || sortConfig.key !== key) {
            return <span className="material-symbols-outlined text-[12px] opacity-40 ml-1 select-none align-middle">unfold_more</span>;
        }
        return sortConfig.direction === 'asc'
            ? <span className="material-symbols-outlined text-[12px] text-primary ml-1 select-none align-middle font-bold">arrow_upward</span>
            : <span className="material-symbols-outlined text-[12px] text-primary ml-1 select-none align-middle font-bold">arrow_downward</span>;
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [planillaSearch, planillaFilterType, planillaStartDate, planillaEndDate, planillaBillingStartDate, planillaBillingEndDate, rowsPerPage]);

    // Filtered Planilla Rows
    const filteredPlanilla = useMemo(() => {
        return planillaRows.filter(row => {
            // Text search
            const q = planillaSearch.toLowerCase().trim();
            if (q) {
                const matchText = (
                    String(row.paciente || '').toLowerCase().includes(q) ||
                    String(row.dni || '').toLowerCase().includes(q) ||
                    String(row.nuc || '').toLowerCase().includes(q) ||
                    String(row.profesional || '').toLowerCase().includes(q) ||
                    String(row.surgery_id || '').toLowerCase().includes(q) ||
                    String(row.cobertura || '').toLowerCase().includes(q)
                );
                if (!matchText) return false;
            }

            // Status filter
            if (planillaFilterType === 'sin_factur') {
                if (row.fe_factur) return false;
            } else if (planillaFilterType === 'con_factur') {
                if (!row.fe_factur) return false;
            } else if (planillaFilterType === 'sin_aoter') {
                if (row.fe_aoter) return false;
            } else if (planillaFilterType === 'con_aoter') {
                if (!row.fe_aoter) return false;
            } else if (planillaFilterType === 'completas') {
                if (!row.fe_factur || !row.fe_aoter) return false;
            } else if (planillaFilterType === 'solo_ambulatorias') {
                if (!row.is_guardia) return false;
            } else if (planillaFilterType === 'solo_internacion') {
                if (row.is_guardia) return false;
            }

            // Date range filter for Surgery / Admission Date (fechaRaw)
            if (row.fechaRaw) {
                const rowDate = row.fechaRaw.substring(0, 10);
                if (planillaStartDate && rowDate < planillaStartDate) return false;
                if (planillaEndDate && rowDate > planillaEndDate) return false;
            } else if (planillaStartDate || planillaEndDate) {
                return false;
            }

            // Date range filter for Billing Date (fe_factur)
            if (planillaBillingStartDate || planillaBillingEndDate) {
                if (!row.fe_factur) return false;
                const feFacturDate = row.fe_factur.substring(0, 10);
                if (planillaBillingStartDate && feFacturDate < planillaBillingStartDate) return false;
                if (planillaBillingEndDate && feFacturDate > planillaBillingEndDate) return false;
            }

            return true;
        });
    }, [planillaRows, planillaSearch, planillaFilterType, planillaStartDate, planillaEndDate, planillaBillingStartDate, planillaBillingEndDate]);

    // Sorted Planilla Rows
    const sortedPlanilla = useMemo(() => {
        if (!sortConfig) return filteredPlanilla;
        return [...filteredPlanilla].sort((a, b) => {
            let aVal: any = a[sortConfig.key];
            let bVal: any = b[sortConfig.key];

            if (sortConfig.key === 'fecha') {
                aVal = a.fechaRaw || '';
                bVal = b.fechaRaw || '';
            }

            if (aVal === null || aVal === undefined || aVal === '—') aVal = '';
            if (bVal === null || bVal === undefined || bVal === '—') bVal = '';

            if (typeof aVal === 'string') {
                return sortConfig.direction === 'asc'
                    ? aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' })
                    : bVal.localeCompare(aVal, undefined, { numeric: true, sensitivity: 'base' });
            } else {
                return sortConfig.direction === 'asc'
                    ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0)
                    : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0);
            }
        });
    }, [filteredPlanilla, sortConfig]);

    // Paginated Planilla Rows
    const paginatedPlanilla = useMemo(() => {
        if (rowsPerPage === -1) return sortedPlanilla;
        const startIndex = (currentPage - 1) * rowsPerPage;
        return sortedPlanilla.slice(startIndex, startIndex + rowsPerPage);
    }, [sortedPlanilla, currentPage, rowsPerPage]);

    const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(sortedPlanilla.length / rowsPerPage);

    const allFilteredSelected = paginatedPlanilla.length > 0 && paginatedPlanilla.every(r => selectedRows.has(r.admission_id));

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            const next = new Set(selectedRows);
            paginatedPlanilla.forEach(r => next.delete(r.admission_id));
            setSelectedRows(next);
        } else {
            const next = new Set(selectedRows);
            paginatedPlanilla.forEach(r => next.add(r.admission_id));
            setSelectedRows(next);
        }
    };

    const toggleRow = (id: string) => {
        const next = new Set(selectedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRows(next);
    };

    // ── Render ───────────────────────────────────────────────────────
    return (
        <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Facturación</h1>
                    <p className="text-slate-500 font-medium">Gestión de internaciones finalizadas y procedimientos.</p>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <span className="material-symbols-outlined text-sm">analytics</span>
                        Estadísticas
                    </button>
                    <button
                        onClick={() => setActiveTab('planilla')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'planilla' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <span className="material-symbols-outlined text-sm">table_chart</span>
                        Planilla Internaciones
                    </button>
                    <button
                        onClick={() => setActiveTab('pendientes')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'pendientes' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setActiveTab('historial')}
                        className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'historial' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Historial
                    </button>
                </div>
            </header>

            {/* ── TAB: ESTADÍSTICAS ─────────────────────────────────────────── */}
            {activeTab === 'dashboard' && (() => {
                // Calcular estadísticas sobre los datos filtrados en tiempo real
                const totalFiltered = filteredPlanilla.length;
                
                const completas = filteredPlanilla.filter(r => r.fe_factur && r.fe_aoter).length;
                const sinFactur = filteredPlanilla.filter(r => !r.fe_factur).length;
                const sinAoter = filteredPlanilla.filter(r => !r.fe_aoter).length;
                
                const oserCount = filteredPlanilla.filter(r => String(r.cobertura).toUpperCase().includes('OSER')).length;
                const ambulatoryCount = filteredPlanilla.filter(r => !!r.is_guardia).length;

                // Internaciones facturadas en el período filtrado (fecha de factura dentro de planillaStartDate/planillaEndDate)
                let invoicedInPeriodCount = 0;
                let invoicedSamePeriodCount = 0;
                let invoicedPrevPeriodCount = 0;
                let invoicedInPeriodRows: PlanillaRow[] = [];

                if (planillaStartDate || planillaEndDate) {
                    invoicedInPeriodRows = planillaRows.filter(r => {
                        if (!r.fe_factur) return false;
                        if (planillaStartDate && r.fe_factur < planillaStartDate) return false;
                        if (planillaEndDate && r.fe_factur > planillaEndDate) return false;
                        if (planillaSearch) {
                            const q = planillaSearch.toLowerCase().trim();
                            const matchText = (
                                String(r.paciente || '').toLowerCase().includes(q) ||
                                String(r.dni || '').toLowerCase().includes(q) ||
                                String(r.nuc || '').toLowerCase().includes(q) ||
                                String(r.profesional || '').toLowerCase().includes(q) ||
                                String(r.surgery_id || '').toLowerCase().includes(q) ||
                                String(r.cobertura || '').toLowerCase().includes(q)
                            );
                            if (!matchText) return false;
                        }
                        return true;
                    });
                    invoicedInPeriodCount = invoicedInPeriodRows.length;
                    invoicedSamePeriodCount = invoicedInPeriodRows.filter(r => {
                        if (!r.fechaRaw) return false;
                        const rowDate = r.fechaRaw.substring(0, 10);
                        if (planillaStartDate && rowDate < planillaStartDate) return false;
                        if (planillaEndDate && rowDate > planillaEndDate) return false;
                        return true;
                    }).length;
                    invoicedPrevPeriodCount = invoicedInPeriodCount - invoicedSamePeriodCount;
                } else {
                    invoicedInPeriodRows = filteredPlanilla.filter(r => !!r.fe_factur);
                    invoicedInPeriodCount = invoicedInPeriodRows.length;
                    invoicedSamePeriodCount = invoicedInPeriodCount;
                    invoicedPrevPeriodCount = 0;
                }

                // Distribución por Obra Social (top 5 y otros)
                const osMap: Record<string, number> = {};
                filteredPlanilla.forEach(r => {
                    const cob = String(r.cobertura || 'PARTICULAR').toUpperCase().trim();
                    osMap[cob] = (osMap[cob] || 0) + 1;
                });
                
                const rawOsData = Object.entries(osMap).map(([name, value]) => ({ name, value }));
                rawOsData.sort((a, b) => b.value - a.value);
                
                const top5 = rawOsData.slice(0, 5);
                const othersCount = rawOsData.slice(5).reduce((sum, item) => sum + item.value, 0);
                const osDataForChart = othersCount > 0 
                    ? [...top5, { name: 'OTRAS', value: othersCount }]
                    : top5;

                // Datos para volumen diario (agrupados por fecha de práctica y fecha de factura en período filtrado)
                const uniqueDates = new Set<string>();
                const admissionsInPeriod = planillaRows.filter(r => {
                    if (!r.fechaRaw) return false;
                    const rowDate = r.fechaRaw.substring(0, 10);
                    if (planillaStartDate && rowDate < planillaStartDate) return false;
                    if (planillaEndDate && rowDate > planillaEndDate) return false;
                    return true;
                });

                const invoicedInPeriod = planillaRows.filter(r => {
                    if (!r.fe_factur) return false;
                    if (planillaStartDate && r.fe_factur < planillaStartDate) return false;
                    if (planillaEndDate && r.fe_factur > planillaEndDate) return false;
                    return true;
                });

                if (planillaStartDate || planillaEndDate) {
                    admissionsInPeriod.forEach(r => {
                        if (r.fechaRaw) uniqueDates.add(r.fechaRaw.substring(0, 10));
                    });
                    invoicedInPeriod.forEach(r => {
                        if (r.fe_factur) uniqueDates.add(r.fe_factur.substring(0, 10));
                    });
                } else {
                    const sortedAdms = [...planillaRows]
                        .filter(r => r.fechaRaw)
                        .sort((a, b) => b.fechaRaw.localeCompare(a.fechaRaw))
                        .slice(0, 15);
                    sortedAdms.forEach(r => uniqueDates.add(r.fechaRaw.substring(0, 10)));
                }

                const sortedDates = Array.from(uniqueDates).sort();

                const volumeChartData = sortedDates.map(dateStr => {
                    const formattedDate = format(parseISO(dateStr), 'dd/MM/yyyy');
                    
                    const totalAdmissions = admissionsInPeriod.filter(r => r.fechaRaw && r.fechaRaw.substring(0, 10) === dateStr).length;
                    const totalInvoiced = invoicedInPeriod.filter(r => r.fe_factur && r.fe_factur === dateStr).length;
                    const invoicedPrevPeriod = invoicedInPeriod.filter(r => 
                        r.fe_factur && r.fe_factur === dateStr && r.fechaRaw && (planillaStartDate ? r.fechaRaw.substring(0, 10) < planillaStartDate : false)
                    ).length;

                    return {
                        date: formattedDate,
                        "Total Internaciones": totalAdmissions,
                        "Total Facturado": totalInvoiced,
                        "Facturado Períodos Anteriores": invoicedPrevPeriod
                    };
                });

                const chartDataToRender = (planillaStartDate || planillaEndDate) ? volumeChartData : volumeChartData.slice(-15);

                // Datos de comparación de barra para el período filtrado
                const totalInPeriod = filteredPlanilla.length;
                const billedInPeriod = filteredPlanilla.filter(r => r.fe_factur).length;
                const aoterInPeriod = filteredPlanilla.filter(r => r.fe_aoter).length;

                const stateChartData = [
                    { name: 'Total Internaciones', cantidad: totalInPeriod, fill: '#6366f1' },
                    { name: 'Facturadas', cantidad: billedInPeriod, fill: '#10b981' },
                    { name: 'Con AOTER', cantidad: aoterInPeriod, fill: '#f59e0b' },
                ];

                const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#94a3b8'];

                return (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Filtros rápidos compartidos */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-4 flex-1">
                                <div className="relative flex-1 min-w-[240px]">
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar para filtrar estadísticas..."
                                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-semibold transition-all"
                                        value={planillaSearch}
                                        onChange={e => setPlanillaSearch(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                        <span className="material-symbols-outlined text-xs text-slate-400">calendar_today</span>
                                        <span className="text-[11px] font-bold text-slate-600">Fecha Práctica:</span>
                                        <input
                                            type="date"
                                            value={planillaStartDate}
                                            onChange={e => setPlanillaStartDate(e.target.value)}
                                            className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold bg-white cursor-pointer"
                                        />
                                        <span className="text-slate-400 font-bold text-xs">a</span>
                                        <input
                                            type="date"
                                            value={planillaEndDate}
                                            onChange={e => setPlanillaEndDate(e.target.value)}
                                            className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold bg-white cursor-pointer"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 bg-emerald-50/70 px-3 py-1.5 rounded-xl border border-emerald-200/80">
                                        <span className="material-symbols-outlined text-xs text-emerald-600">receipt_long</span>
                                        <span className="text-[11px] font-bold text-emerald-900">Fecha Facturación:</span>
                                        <input
                                            type="date"
                                            value={planillaBillingStartDate}
                                            onChange={e => setPlanillaBillingStartDate(e.target.value)}
                                            className="px-2 py-1 rounded-lg border border-emerald-200 text-xs font-semibold bg-white cursor-pointer"
                                        />
                                        <span className="text-emerald-500 font-bold text-xs">a</span>
                                        <input
                                            type="date"
                                            value={planillaBillingEndDate}
                                            onChange={e => setPlanillaBillingEndDate(e.target.value)}
                                            className="px-2 py-1 rounded-lg border border-emerald-200 text-xs font-semibold bg-white cursor-pointer"
                                        />
                                    </div>

                                    {(planillaStartDate || planillaEndDate || planillaBillingStartDate || planillaBillingEndDate || planillaSearch) && (
                                        <button
                                            onClick={() => {
                                                setPlanillaStartDate('');
                                                setPlanillaEndDate('');
                                                setPlanillaBillingStartDate('');
                                                setPlanillaBillingEndDate('');
                                                setPlanillaSearch('');
                                            }}
                                            className="text-primary hover:underline flex items-center gap-1 font-black uppercase text-[10px] ml-1"
                                        >
                                            <span className="material-symbols-outlined text-xs">close</span>
                                            Limpiar Filtros
                                        </button>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={fetchPlanilla}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-bold text-slate-600 transition-all"
                            >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                Actualizar Datos
                            </button>
                        </div>

                        {/* KPIs Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Card 1: Internaciones Totales */}
                            <div 
                                onClick={() => {
                                    setStatModalSearch('');
                                    setStatModalData({
                                        title: 'Internaciones Totales',
                                        description: 'Listado completo de cirugías e internaciones computadas con los filtros actuales.',
                                        icon: 'table_chart',
                                        badgeColor: 'indigo',
                                        rows: filteredPlanilla
                                    });
                                }}
                                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-indigo-300 hover:scale-[1.01] transition-all duration-200"
                            >
                                <div className="size-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                                    <span className="material-symbols-outlined text-2xl">table_chart</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internaciones Totales</p>
                                        <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-indigo-600 transition-colors">visibility</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{totalFiltered}</h3>
                                    <p className="text-[10px] text-indigo-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Haz click para ver detalle &rarr;</p>
                                </div>
                            </div>

                            {/* Card 2: Internaciones Facturadas */}
                            <div 
                                onClick={() => {
                                    setStatModalSearch('');
                                    setStatModalData({
                                        title: 'Internaciones Facturadas',
                                        description: 'Listado de cirugías e internaciones con Fecha de Facturación asignada.',
                                        icon: 'verified',
                                        badgeColor: 'emerald',
                                        rows: invoicedInPeriodRows
                                    });
                                }}
                                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-emerald-300 hover:scale-[1.01] transition-all duration-200"
                            >
                                <div className="size-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                                    <span className="material-symbols-outlined text-2xl">verified</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internaciones Facturadas</p>
                                        <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-emerald-600 transition-colors">visibility</span>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <h3 className="text-3xl font-black text-slate-900">{invoicedInPeriodCount}</h3>
                                    </div>
                                    {(planillaStartDate || planillaEndDate) && (
                                        <div className="text-[10px] text-slate-400 font-bold mt-1 space-y-0.5">
                                            <p className="text-emerald-600 font-extrabold">{invoicedSamePeriodCount} correspondientes al período</p>
                                            <p className="text-amber-600 font-extrabold">{invoicedPrevPeriodCount} de períodos anteriores</p>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Haz click para ver detalle &rarr;</p>
                                </div>
                            </div>

                            {/* Card 3: Internaciones Ambulatorias */}
                            <div 
                                onClick={() => {
                                    setStatModalSearch('');
                                    setStatModalData({
                                        title: 'Internaciones Ambulatorias',
                                        description: 'Listado de cirugías y procedimientos de carácter ambulatorio o guardia.',
                                        icon: 'medical_services',
                                        badgeColor: 'purple',
                                        rows: filteredPlanilla.filter(r => !!r.is_guardia)
                                    });
                                }}
                                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-purple-300 hover:scale-[1.01] transition-all duration-200"
                            >
                                <div className="size-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                                    <span className="material-symbols-outlined text-2xl">medical_services</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internaciones Ambulatorias</p>
                                        <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-purple-600 transition-colors">visibility</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{ambulatoryCount}</h3>
                                    <p className="text-[10px] text-purple-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Haz click para ver detalle &rarr;</p>
                                </div>
                            </div>

                            {/* Card 4: Pacientes OSER */}
                            <div 
                                onClick={() => {
                                    setStatModalSearch('');
                                    setStatModalData({
                                        title: 'Pacientes OSER',
                                        description: 'Listado de cirugías e internaciones pertenecientes a la cobertura OSER.',
                                        icon: 'sync_alt',
                                        badgeColor: 'amber',
                                        rows: filteredPlanilla.filter(r => String(r.cobertura).toUpperCase().includes('OSER'))
                                    });
                                }}
                                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-amber-300 hover:scale-[1.01] transition-all duration-200"
                            >
                                <div className="size-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                                    <span className="material-symbols-outlined text-2xl">sync_alt</span>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pacientes OSER</p>
                                        <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-amber-600 transition-colors">visibility</span>
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 mt-1">{oserCount}</h3>
                                    <p className="text-[10px] text-amber-600 font-bold mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Haz click para ver detalle &rarr;</p>
                                </div>
                            </div>
                        </div>

                        {/* Charts Area */}
                        {totalFiltered === 0 ? (
                            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                                <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">analytics</span>
                                <p className="text-slate-400 font-bold uppercase">No hay datos suficientes para graficar</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Distribución Obra Social */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-1 flex flex-col">
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-xs mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">pie_chart</span>
                                        Distribución por Obra Social
                                    </h3>
                                    <div className="h-64 relative flex-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={osDataForChart}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={90}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                >
                                                    {osDataForChart.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip 
                                                    contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                                                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-2xl font-black text-slate-800">{rawOsData.length}</span>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Coberturas</span>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                                        {osDataForChart.map((item, idx) => (
                                            <div key={item.name} className="flex items-center gap-1.5 truncate">
                                                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                                                <span className="truncate uppercase">{item.name} ({item.value})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Volumen de Internaciones */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-xs mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">stacked_line_chart</span>
                                        Ingresos de Internación por Día (Últimos activos)
                                    </h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartDataToRender}>
                                                <defs>
                                                    <linearGradient id="colorInternaciones" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                    </linearGradient>
                                                    <linearGradient id="colorFacturado" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} fontWeight="bold" />
                                                <YAxis stroke="#94a3b8" fontSize={9} fontWeight="bold" allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                                                    labelClassName="text-slate-400 font-bold text-xs uppercase"
                                                />
                                                <Area type="monotone" dataKey="Total Internaciones" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorInternaciones)" />
                                                <Area type="monotone" dataKey="Total Facturado" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorFacturado)" />
                                                <Line type="monotone" dataKey="Facturado Períodos Anteriores" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Estados de Facturación */}
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-3">
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-xs mb-6 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">bar_chart</span>
                                        Estado de Carga de Fechas de Facturación
                                    </h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={stateChartData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="bold" />
                                                <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" allowDecimals={false} />
                                                <Tooltip
                                                    contentStyle={{ background: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff' }}
                                                />
                                                <Bar dataKey="cantidad" name="Registros" radius={[8, 8, 0, 0]}>
                                                    {stateChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ── TAB: PLANILLA ───────────────────────────────────────────── */}
            {activeTab === 'planilla' && (
                <div className="space-y-4">

                    {/* Header de planilla + búsqueda y filtros */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="relative flex-1 min-w-[280px]">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por paciente, DNI, NUC, cobertura, profesional..."
                                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-semibold transition-all"
                                    value={planillaSearch}
                                    onChange={e => setPlanillaSearch(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-2 min-w-[200px]">
                                <span className="material-symbols-outlined text-slate-400 text-sm">filter_alt</span>
                                <select
                                    value={planillaFilterType}
                                    onChange={e => setPlanillaFilterType(e.target.value as any)}
                                    className="px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-bold text-slate-600 bg-white transition-all cursor-pointer"
                                >
                                    <option value="todos">Todos los registros</option>
                                    <option value="sin_factur">1) Sin fecha factura</option>
                                    <option value="con_factur">2) Con fecha factura</option>
                                    <option value="sin_aoter">3) Sin fecha aoter</option>
                                    <option value="con_aoter">4) Con fecha aoter</option>
                                    <option value="completas">5) Con ambas fechas</option>
                                    <option value="solo_ambulatorias">6) Solo Ambulatorias / Guardia</option>
                                    <option value="solo_internacion">7) Solo Internaciones / Quirófano</option>
                                </select>
                            </div>

                            <button
                                onClick={fetchPlanilla}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-bold text-slate-600 transition-all ml-auto"
                            >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                Actualizar
                            </button>
                        </div>

                        {/* Rango de fechas de ingreso / cirugía y fecha de facturación */}
                        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-xs text-slate-500 font-bold">
                            <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                                <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
                                <span>Práctica:</span>
                                <input
                                    type="date"
                                    value={planillaStartDate}
                                    onChange={e => setPlanillaStartDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-semibold bg-white cursor-pointer"
                                />
                                <span>a</span>
                                <input
                                    type="date"
                                    value={planillaEndDate}
                                    onChange={e => setPlanillaEndDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-semibold bg-white cursor-pointer"
                                />
                            </div>

                            <div className="flex items-center gap-2 bg-emerald-50/70 px-2.5 py-1 rounded-xl border border-emerald-200/80">
                                <span className="material-symbols-outlined text-sm text-emerald-600">receipt_long</span>
                                <span className="text-emerald-900 font-bold">Facturación:</span>
                                <input
                                    type="date"
                                    value={planillaBillingStartDate}
                                    onChange={e => setPlanillaBillingStartDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-xs font-semibold bg-white cursor-pointer"
                                />
                                <span className="text-emerald-600">a</span>
                                <input
                                    type="date"
                                    value={planillaBillingEndDate}
                                    onChange={e => setPlanillaBillingEndDate(e.target.value)}
                                    className="px-2 py-1 rounded-lg border border-emerald-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-xs font-semibold bg-white cursor-pointer"
                                />
                            </div>

                            {(planillaStartDate || planillaEndDate || planillaBillingStartDate || planillaBillingEndDate || planillaFilterType !== 'todos') && (
                                <button
                                    onClick={() => {
                                        setPlanillaStartDate('');
                                        setPlanillaEndDate('');
                                        setPlanillaBillingStartDate('');
                                        setPlanillaBillingEndDate('');
                                        setPlanillaFilterType('todos');
                                    }}
                                    className="text-primary hover:underline flex items-center gap-1 font-black uppercase text-[10px]"
                                >
                                    <span className="material-symbols-outlined text-xs">close</span>
                                    Limpiar Filtros
                                </button>
                            )}
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-auto">
                                {filteredPlanilla.length} registros filtrados
                            </div>
                        </div>
                    </div>

                    {/* Barra de acción masiva (aparece al seleccionar filas) */}
                    {selectedRows.size > 0 && (
                        <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-4 flex flex-wrap items-end gap-4 animate-fadeIn">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">checklist</span>
                                <span className="font-black text-primary text-sm uppercase tracking-tight">
                                    {selectedRows.size} fila{selectedRows.size !== 1 ? 's' : ''} seleccionada{selectedRows.size !== 1 ? 's' : ''}
                                </span>
                            </div>

                            <div className="flex flex-wrap items-end gap-3 flex-1">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fe Factur (aplicar a seleccionadas)</label>
                                    <input
                                        type="date"
                                        value={bulkFeFactur}
                                        onChange={e => setBulkFeFactur(e.target.value)}
                                        className="px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-semibold transition-all bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fe Aoter (aplicar a seleccionadas)</label>
                                    <input
                                        type="date"
                                        value={bulkFeAoter}
                                        onChange={e => setBulkFeAoter(e.target.value)}
                                        className="px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-semibold transition-all bg-white"
                                    />
                                </div>
                                <button
                                    onClick={applyBulkDates}
                                    disabled={savingBulk || (!bulkFeFactur && !bulkFeAoter)}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                                >
                                    {savingBulk
                                        ? <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                        : <span className="material-symbols-outlined text-sm">check_circle</span>
                                    }
                                    Aplicar a seleccionadas
                                </button>
                                <button
                                    onClick={() => {
                                        if ((window as any).electronAPI) {
                                            (window as any).electronAPI.sendReadyToPrint();
                                        } else {
                                            window.print();
                                        }
                                    }}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 transition-all shadow-lg shadow-slate-800/20"
                                    title="Imprimir filas seleccionadas"
                                >
                                    <span className="material-symbols-outlined text-sm">print</span>
                                    Imprimir seleccionadas
                                </button>
                                <button
                                    onClick={() => setSelectedRows(new Set())}
                                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-500 font-bold text-sm hover:bg-slate-100 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Tabla */}
                    {planillaLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando planilla...</p>
                        </div>
                    ) : filteredPlanilla.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">table_chart</span>
                            <p className="text-slate-400 font-bold uppercase">No hay registros de internaciones para mostrar</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className="bg-slate-50 border-b-2 border-slate-200">
                                        <tr>
                                            <th className="px-3 py-3 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={allFilteredSelected}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer w-4 h-4"
                                                />
                                            </th>
                                            <th 
                                                onClick={() => requestSort('fecha')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Fecha Práctica {renderSortIcon('fecha')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('profesional')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Profesional {renderSortIcon('profesional')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('paciente')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Paciente {renderSortIcon('paciente')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('cobertura')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Cobertura {renderSortIcon('cobertura')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('fe_factur')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Fe Factur {renderSortIcon('fe_factur')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('fe_aoter')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Fe Aoter {renderSortIcon('fe_aoter')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('nro_hc')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                Nro HC {renderSortIcon('nro_hc')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('nuc')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                NUC {renderSortIcon('nuc')}
                                            </th>
                                            <th 
                                                onClick={() => requestSort('dni')}
                                                className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-colors"
                                            >
                                                DNI {renderSortIcon('dni')}
                                            </th>
                                            <th className="px-3 py-3 font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">ID Cirugía</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedPlanilla.map((row, idx) => {
                                            const isSelected = selectedRows.has(row.admission_id);
                                            return (
                                                <tr
                                                    key={row.admission_id}
                                                    className={`transition-colors group ${isSelected ? 'bg-primary/5' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50/70' : 'bg-slate-50/40 hover:bg-slate-50/70'}`}
                                                >
                                                    {/* Checkbox */}
                                                    <td className="px-3 py-2.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleRow(row.admission_id)}
                                                            className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer w-4 h-4"
                                                        />
                                                    </td>

                                                    {/* Fecha */}
                                                    <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{row.fecha}</td>

                                                    {/* Profesional */}
                                                    <td className="px-3 py-2.5 font-bold text-slate-700 uppercase whitespace-nowrap max-w-[140px] truncate" title={row.profesional}>
                                                        {row.profesional}
                                                    </td>

                                                    {/* Paciente */}
                                                    <td className="px-3 py-2.5 font-black text-slate-900 uppercase whitespace-nowrap max-w-[160px] truncate" title={row.paciente}>
                                                        {row.paciente}
                                                    </td>

                                                    {/* Cobertura */}
                                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full font-bold uppercase text-[10px]">
                                                            {row.cobertura}
                                                        </span>
                                                    </td>

                                                    {/* Fe Factur - input editable */}
                                                    <td className="px-3 py-2.5">
                                                        <div className="relative">
                                                            <input
                                                                type="date"
                                                                value={row.fe_factur}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setPlanillaRows(prev =>
                                                                        prev.map(r => r.admission_id === row.admission_id ? { ...r, fe_factur: val } : r)
                                                                    );
                                                                }}
                                                                onBlur={e => saveRowDate(row.admission_id, 'fe_factur', e.target.value, row)}
                                                                className="px-2 py-1 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-semibold bg-white transition-all w-[130px]"
                                                            />
                                                            {savingRow === row.admission_id + 'fe_factur' && (
                                                                <span className="absolute right-2 top-1.5 size-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block"></span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Fe Aoter - input editable */}
                                                    <td className="px-3 py-2.5">
                                                        <div className="relative">
                                                            <input
                                                                type="date"
                                                                value={row.fe_aoter}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setPlanillaRows(prev =>
                                                                        prev.map(r => r.admission_id === row.admission_id ? { ...r, fe_aoter: val } : r)
                                                                    );
                                                                }}
                                                                onBlur={e => saveRowDate(row.admission_id, 'fe_aoter', e.target.value, row)}
                                                                className="px-2 py-1 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-semibold bg-white transition-all w-[130px]"
                                                            />
                                                            {savingRow === row.admission_id + 'fe_aoter' && (
                                                                <span className="absolute right-2 top-1.5 size-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block"></span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Nro HC */}
                                                    <td className="px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap">{row.nro_hc}</td>

                                                    {/* NUC */}
                                                    <td className="px-3 py-2.5">
                                                        {row.nuc && row.nuc !== '—'
                                                            ? <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-bold text-[10px]">{row.nuc}</span>
                                                            : <span className="text-slate-300 font-bold">—</span>
                                                        }
                                                    </td>

                                                    {/* DNI */}
                                                    <td className="px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap">{row.dni}</td>

                                                    {/* ID de Cirugía */}
                                                    <td className="px-3 py-2.5">
                                                        {row.surgery_id
                                                            ? <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg font-bold" title={row.surgery_id}>
                                                                {row.surgery_id.slice(-8).toUpperCase()}
                                                              </span>
                                                            : <span className="text-slate-300 font-bold">—</span>
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls Footer */}
                            <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-bold text-slate-500">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span>Filas por página:</span>
                                        <select
                                            value={rowsPerPage}
                                            onChange={e => setRowsPerPage(Number(e.target.value))}
                                            className="px-2 py-1 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none bg-white cursor-pointer font-bold text-slate-700"
                                        >
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={200}>200</option>
                                            <option value={-1}>Todos</option>
                                        </select>
                                    </div>
                                    <span>
                                        Mostrando {sortedPlanilla.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} - {rowsPerPage === -1 ? sortedPlanilla.length : Math.min(currentPage * rowsPerPage, sortedPlanilla.length)} de {sortedPlanilla.length} registros
                                    </span>
                                </div>

                                {rowsPerPage !== -1 && totalPages > 1 && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(1)}
                                            className="size-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            title="Primera página"
                                        >
                                            <span className="material-symbols-outlined text-sm">first_page</span>
                                        </button>
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            className="size-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            title="Anterior"
                                        >
                                            <span className="material-symbols-outlined text-sm">chevron_left</span>
                                        </button>
                                        
                                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-black">
                                            Página {currentPage} de {totalPages}
                                        </span>

                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            className="size-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            title="Siguiente"
                                        >
                                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                                        </button>
                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(totalPages)}
                                            className="size-8 rounded-lg flex items-center justify-center border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            title="Última página"
                                        >
                                            <span className="material-symbols-outlined text-sm">last_page</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}            {/* ── TABs: PENDIENTES / HISTORIAL ─────────────────────────────── */}
            {activeTab !== 'planilla' && activeTab !== 'dashboard' && (
                <>
                    {/* Search Bar */}
                    <div className="mb-6 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                            <input
                                type="text"
                                placeholder="Buscar por paciente, NUC o número de documento..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm font-semibold transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando registros...</p>
                        </div>
                    ) : filteredAdmissions.length === 0 ? (
                        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">receipt_long</span>
                            <p className="text-slate-400 font-bold uppercase">No hay internaciones {activeTab} para mostrar</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {filteredAdmissions.map(adm => {
                                const isDuplicateNuc = adm.patient?.nuc && admissions.filter(
                                    a => a.id !== adm.id && a.patient?.nuc === adm.patient.nuc
                                ).length > 0;

                                return (
                                    <div
                                        key={adm.id}
                                        onClick={() => fetchAdmissionDetails(adm)}
                                        className={`bg-white border rounded-2xl p-5 hover:shadow-xl transition-all cursor-pointer flex items-center gap-6 group relative overflow-hidden ${
                                            isDuplicateNuc ? 'border-amber-300 hover:border-amber-500' : 'border-slate-200 hover:border-primary'
                                        }`}
                                    >
                                        {isDuplicateNuc && (
                                            <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider py-1 px-4 flex items-center gap-1.5 shadow-sm animate-fadeIn">
                                                <span className="material-symbols-outlined text-[10px] animate-pulse">warning</span>
                                                Atención: Existe otro registro con este mismo NUC en esta lista
                                            </div>
                                        )}
                                        <div className={`size-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-colors ${isDuplicateNuc ? 'mt-3' : ''}`}>
                                            <span className="material-symbols-outlined text-3xl">patient_list</span>
                                        </div>

                                        <div className={`flex-1 ${isDuplicateNuc ? 'mt-3' : ''}`}>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="font-black text-slate-900 uppercase tracking-tight">{adm.patient.full_name || adm.patient.name}</h3>
                                                {adm.patient.nuc && (
                                                    <span className={`text-[10px] border px-2 py-0.5 rounded-full font-bold uppercase ${
                                                        isDuplicateNuc ? 'bg-amber-100 border-amber-200 text-amber-800 font-black' : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                                    }`}>
                                                        NUC: {adm.patient.nuc}
                                                    </span>
                                                )}
                                                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500 uppercase">DNI: {adm.patient.document_number}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                                                <div className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">meeting_room</span>
                                                    {adm.room_name} ({adm.bed_code_val})
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">calendar_month</span>
                                                    {adm.check_in && format(parseISO(adm.check_in), 'dd/MM/yy HH:mm')} - {adm.check_out && format(parseISO(adm.check_out), 'dd/MM/yy HH:mm')}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={`text-right flex flex-col items-end gap-1 ${isDuplicateNuc ? 'mt-3' : ''}`}>
                                            <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">
                                                {calculateDays(adm.check_in, adm.check_out!)} Días Estancia
                                            </div>
                                            {adm.billing_status === 'facturado' && (
                                                <p className="text-[9px] text-emerald-600 font-bold uppercase flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px]">verified</span>
                                                    Facturado por {adm.billed_by}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Detail Modal */}
            {selectedAdmission && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn print:hidden">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">

                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Detalle de Facturación</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase">Consolidado de servicios e insumos</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        if ((window as any).electronAPI) {
                                            (window as any).electronAPI.sendReadyToPrint();
                                        } else {
                                            window.print();
                                        }
                                    }}
                                    className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                                    title="Imprimir usando el diálogo del sistema"
                                >
                                    <span className="material-symbols-outlined text-lg">print</span>
                                    {(window as any).electronAPI ? 'Imprimir' : 'Imprimir / PDF'}
                                </button>
                                {(window as any).electronAPI && (
                                    <button
                                        onClick={async () => {
                                            const defaultName = `Facturacion_${selectedAdmission.patient.full_name?.replace(/\s+/g, '_')}_${selectedAdmission.id.slice(-6).toUpperCase()}.pdf`;
                                            const res = await (window as any).electronAPI.savePDF(defaultName);
                                            if (res?.success) {
                                                alert(`PDF guardado con éxito en:\n${res.path}`);
                                            } else if (res && !res.cancelled) {
                                                alert(`Error al guardar PDF: ${res.error}`);
                                            }
                                        }}
                                        className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                                        Guardar PDF
                                    </button>
                                )}
                                {selectedAdmission.billing_status === 'pendiente' && canManageBilling && (
                                    <button
                                        onClick={() => markAsBilled(selectedAdmission.id)}
                                        disabled={isProcessing}
                                        className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                                    >
                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                        Marcar como Facturado
                                    </button>
                                )}
                                {canManageBilling && (
                                    <button
                                        onClick={() => deleteAdmission(selectedAdmission.id)}
                                        disabled={isProcessing}
                                        className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-100 transition-all shadow-sm"
                                        title="Eliminar esta internación permanentemente"
                                    >
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                        Eliminar Internación
                                    </button>
                                )}
                                <button onClick={() => setSelectedAdmission(null)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body (Screen only) */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white custom-scrollbar">
                            {/* Patient Info Card */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-8 relative overflow-hidden group">
                                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-9xl text-slate-200/50 rotate-12 group-hover:rotate-0 transition-transform duration-700">patient_list</span>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                        <span className="size-2 bg-primary rounded-full animate-pulse"></span>
                                        Información del Paciente
                                    </h4>
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-6 relative z-10">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Apellido y Nombre</p>
                                            <p className="text-2xl font-black text-slate-900 uppercase leading-tight tracking-tight">{selectedAdmission.patient.full_name || selectedAdmission.patient.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Documento / DNI</p>
                                            <p className="text-2xl font-black text-slate-900 tracking-tighter">{selectedAdmission.patient.document_number}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Cobertura / Prepaga</p>
                                            <p className="text-lg font-black text-primary uppercase">
                                                {selectedAdmission.surgery?.medical_coverage || (selectedAdmission.patient as any).insurance_name || 'PARTICULAR'}
                                                {(selectedAdmission.patient as any).insurance_number && <span className="text-slate-400 font-bold ml-2 text-sm italic">({(selectedAdmission.patient as any).insurance_number})</span>}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Procedimiento</p>
                                            <p className="text-sm font-bold text-slate-700 uppercase leading-relaxed">{selectedAdmission.surgery?.procedure_name || selectedAdmission.surgery?.procedure || 'Ingreso por Enfermería'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center group hover:bg-primary/10 transition-colors duration-500">
                                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Estadía Total</h4>
                                    <p className="text-8xl font-black text-primary leading-none tracking-tighter group-hover:scale-110 transition-transform duration-500">
                                        {calculateDays(selectedAdmission.check_in, selectedAdmission.check_out!)}
                                    </p>
                                    <p className="text-sm font-black text-primary uppercase mt-4 tracking-widest">Días Computados</p>
                                    <div className="mt-4 px-4 py-1.5 bg-white/50 backdrop-blur-sm rounded-full border border-primary/20 text-[10px] text-primary/70 font-bold uppercase tracking-tighter">
                                        Reporte de Facturación
                                    </div>
                                </div>
                            </div>

                            {/* Detalle de Estancia */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">meeting_room</span>
                                    Detalle de Estancia
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Habitación / Cama</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Ingreso</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Egreso</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Duración</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 font-black text-slate-900 uppercase">{selectedAdmission.room_name} - {selectedAdmission.bed_code_val}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase italic">{format(parseISO(selectedAdmission.check_in), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase italic">{selectedAdmission.check_out && format(parseISO(selectedAdmission.check_out), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                                <td className="px-6 py-4 text-sm font-black text-slate-900 text-right">
                                                    <span className="bg-slate-100 px-3 py-1 rounded-lg">
                                                        {selectedAdmission.check_out ? differenceInHours(parseISO(selectedAdmission.check_out), parseISO(selectedAdmission.check_in)) : '---'} hs
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Equipo Profesional */}
                            {selectedAdmission.surgery && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary text-xl">groups</span>
                                        Equipo Profesional Quirúrgico
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">medical_information</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cirujano</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.doctor?.full_name || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined text-2xl">medical_services</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Anestesista</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.anesthesiologist?.full_name || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">person_add</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">1° Ayudante</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.ayudante_1 || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-slate-100 opacity-70">
                                                <span className="material-symbols-outlined">person_add</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">2° Ayudante</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.ayudante_2 || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">content_cut</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Instrumentadora</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.instrumentadora || '---'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Medicación */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">medication_liquid</span>
                                    Medicación en Enfermería
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Medicamento</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-center">Dosis Consolidada</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Administrado por</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedAdmission.medication_logs?.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-12 text-center">
                                                        <span className="material-symbols-outlined text-4xl text-slate-200">medication</span>
                                                        <p className="text-xs font-bold text-slate-300 uppercase mt-2">Sin registros de medicación</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedAdmission.medication_logs?.map(log => (
                                                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-black text-slate-900 uppercase tracking-tighter">{log.medication_name}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-primary text-center">
                                                            <span className="bg-primary/5 px-3 py-1 rounded-full">{log.dose} {log.unit}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-[10px] font-black text-slate-500 text-right uppercase italic">{log.administered_by}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Insumos de Quirófano */}
                            {selectedAdmission.surgery?.form?.surgery_form_items && selectedAdmission.surgery.form.surgery_form_items.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary text-xl">inventory_2</span>
                                        Insumos y Materiales de Quirófano
                                    </h4>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Categoría</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Nombre del Insumo / Material</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Cantidad</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {selectedAdmission.surgery.form.surgery_form_items.map((item: any) => (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${item.type === 'anesthesia' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                                                                {item.type === 'anesthesia' ? 'Anestesia' : 'Quirófano'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-black text-slate-900 uppercase tracking-tighter">{item.name}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-slate-900 text-right uppercase underline decoration-primary/30 underline-offset-4">{item.quantity} {item.unit}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT PORTAL (Strictly Isolated Document) */}
            {selectedAdmission && createPortal(
                <div id="print-billing-portal" className="hidden print:block fixed inset-0 bg-white z-[9999]">
                    <div className="max-w-[21cm] mx-auto p-0 space-y-8 bg-white text-black">

                        <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-6">
                            <div className="flex items-center">
                                <img src={logoIteo} className="h-16 object-contain print-force-adjust" alt="ITEO" />
                            </div>
                            <div className="text-right">
                                <h1 className="text-3xl font-bold uppercase tracking-widest border-2 border-black px-4 py-1 inline-block">Resumen de Facturación</h1>
                                <p className="text-xs mt-1 font-bold">Código Interno: {selectedAdmission.id.slice(-6).toUpperCase()} | Reporte Consolidado de Servicios</p>
                                <p className="text-[10px] uppercase font-bold text-gray-500">Fecha de Emisión: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-0 border-2 border-black overflow-hidden bg-white">
                            <div className="col-span-2 p-6 border-r-2 border-black">
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 border-b border-black pb-1">Información del Paciente</h4>
                                <div className="grid grid-cols-2 gap-y-4">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Apellido y Nombre</p>
                                        <p className="text-xl font-black uppercase leading-tight">{selectedAdmission.patient.full_name || selectedAdmission.patient.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Documento / DNI</p>
                                        <p className="text-xl font-black">{selectedAdmission.patient.document_number}</p>
                                    </div>
                                    <div className="col-span-2 mt-2">
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Cobertura / Prepaga</p>
                                        <p className="text-sm font-black uppercase text-gray-700">
                                            {selectedAdmission.surgery?.medical_coverage || (selectedAdmission.patient as any).insurance_name || 'PARTICULAR'}
                                            {(selectedAdmission.patient as any).insurance_number && <span className="text-gray-500 font-bold ml-2 italic">({(selectedAdmission.patient as any).insurance_number})</span>}
                                        </p>
                                    </div>
                                    <div className="col-span-2 mt-2">
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Diagnóstico / Procedimiento Efectuado</p>
                                        <p className="text-sm font-bold uppercase leading-tight">{selectedAdmission.surgery?.procedure_name || selectedAdmission.surgery?.procedure || 'Ingreso por Enfermería'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 flex flex-col justify-center items-center text-center bg-gray-50">
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Días Computados</h4>
                                <p className="text-7xl font-black leading-none">
                                    {calculateDays(selectedAdmission.check_in, selectedAdmission.check_out!)}
                                </p>
                                <p className="text-[11px] font-black uppercase mt-1">Días de Estancia</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Detalle de Estancia</h4>
                            <table className="w-full text-left border-collapse border-2 border-black">
                                <thead className="bg-gray-100 border-b-2 border-black">
                                    <tr>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Habitación / Cama</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Fecha de Ingreso</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Fecha de Egreso</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase text-right">Total Horas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="px-4 py-3 font-bold text-sm uppercase">{selectedAdmission.room_name} - {selectedAdmission.bed_code_val}</td>
                                        <td className="px-4 py-3 text-xs font-bold uppercase">{format(parseISO(selectedAdmission.check_in), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                        <td className="px-4 py-3 text-xs font-bold uppercase">{format(parseISO(selectedAdmission.check_out!), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                        <td className="px-4 py-3 text-sm font-black text-right">{differenceInHours(parseISO(selectedAdmission.check_out!), parseISO(selectedAdmission.check_in))} hs</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {selectedAdmission.surgery && (
                            <div className="space-y-2 avoid-break">
                                <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Equipo Profesional Quirúrgico</h4>
                                <div className="grid grid-cols-3 border-2 border-black divide-x-2 divide-y-2 divide-black">
                                    <div className="p-3"><p className="text-[9px] font-bold uppercase mb-1">Cirujano</p><p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.doctor?.full_name || '---'}</p></div>
                                    <div className="p-3"><p className="text-[9px] font-bold uppercase mb-1">Anestesista</p><p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.anesthesiologist?.full_name || '---'}</p></div>
                                    <div className="p-3"><p className="text-[9px] font-bold uppercase mb-1">1° Ayudante</p><p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.ayudante_1 || '---'}</p></div>
                                    <div className="p-3"><p className="text-[9px] font-bold uppercase mb-1">2° Ayudante</p><p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.ayudante_2 || '---'}</p></div>
                                    <div className="p-3"><p className="text-[9px] font-bold uppercase mb-1">Instrumentadora</p><p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.instrumentadora || '---'}</p></div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 avoid-break">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Medicación en Enfermería</h4>
                            <table className="w-full text-left border-collapse border-2 border-black">
                                <thead className="bg-gray-100 border-b-2 border-black">
                                    <tr>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Medicamento</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Dosis</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Administrado</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase text-right">Firma</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black">
                                    {selectedAdmission.medication_logs?.map(log => (
                                        <tr key={log.id}>
                                            <td className="px-4 py-1.5 font-bold uppercase text-[10px]">{log.medication_name}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold">{log.dose} {log.unit}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold uppercase">{format(parseISO(log.administered_at!), 'dd/MM/yy HH:mm')}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold text-right uppercase">{log.administered_by}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {selectedAdmission.surgery?.form?.surgery_form_items?.length > 0 && (
                            <div className="space-y-2 avoid-break">
                                <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Materiales e Insumos de Quirófano</h4>
                                <table className="w-full text-left border-collapse border-2 border-black">
                                    <thead className="bg-gray-100 border-b-2 border-black">
                                        <tr>
                                            <th className="px-4 py-1 text-[10px] font-black uppercase">Insumo / Material</th>
                                            <th className="px-4 py-1 text-[10px] font-black uppercase text-right">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {selectedAdmission.surgery.form.surgery_form_items.map((item: any) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-1.5 font-bold uppercase text-[10px]">{item.name}</td>
                                                <td className="px-4 py-1.5 text-[10px] font-black text-right uppercase">{item.quantity} {item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-20 pt-20">
                            <div className="text-center pt-2 border-t-2 border-black">
                                <p className="text-[10px] font-black uppercase tracking-widest">Firma y Sello Auditoría Médica</p>
                            </div>
                            <div className="text-center pt-2 border-t-2 border-black">
                                <p className="text-[10px] font-black uppercase tracking-widest">Responsable de Facturación ITEO</p>
                            </div>
                        </div>

                    </div>
                </div>,
                document.body
            )}

            {selectedRows.size > 0 && createPortal(
                <div id="print-selected-rows" className="hidden print:block fixed inset-0 bg-white z-[9999]">
                    <div className="max-w-[21cm] mx-auto p-0 space-y-6 bg-white text-black text-[10px]">
                        <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-4">
                            <div className="flex items-center">
                                <img src={logoIteo} className="h-12 object-contain print-force-adjust" alt="ITEO" />
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-bold uppercase tracking-widest">Reporte de Internaciones</h1>
                                <p className="text-[9px] uppercase font-bold text-gray-500">Fecha de Emisión: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse border-2 border-black text-[9px]">
                            <thead className="bg-gray-100 border-b-2 border-black">
                                <tr>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Fecha</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Profesional</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Paciente</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Cobertura</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Fe Factur</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Fe Aoter</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">Nro HC</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">NUC</th>
                                    <th className="border border-black px-2 py-1 font-black uppercase">DNI</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black">
                                {planillaRows
                                    .filter(r => selectedRows.has(r.admission_id))
                                    .map(row => (
                                        <tr key={row.admission_id}>
                                            <td className="border border-black px-2 py-1 font-bold">{row.fecha}</td>
                                            <td className="border border-black px-2 py-1 uppercase">{row.profesional}</td>
                                            <td className="border border-black px-2 py-1 uppercase font-black">{row.paciente}</td>
                                            <td className="border border-black px-2 py-1 uppercase font-bold">{row.cobertura}</td>
                                            <td className="border border-black px-2 py-1">{row.fe_factur || '—'}</td>
                                            <td className="border border-black px-2 py-1">{row.fe_aoter || '—'}</td>
                                            <td className="border border-black px-2 py-1">{row.nro_hc}</td>
                                            <td className="border border-black px-2 py-1">{row.nuc || '—'}</td>
                                            <td className="border border-black px-2 py-1">{row.dni}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                        <div className="text-right font-bold uppercase text-[9px] mt-2">
                            Total de registros seleccionados: {planillaRows.filter(r => selectedRows.has(r.admission_id)).length}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Detalle de Tarjeta Estadística */}
            {statModalData && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
                        
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className={`size-12 rounded-2xl flex items-center justify-center ${
                                    statModalData.badgeColor === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                                    statModalData.badgeColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                                    statModalData.badgeColor === 'purple' ? 'bg-purple-100 text-purple-700' :
                                    'bg-indigo-100 text-indigo-700'
                                }`}>
                                    <span className="material-symbols-outlined text-2xl">{statModalData.icon}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{statModalData.title}</h2>
                                        <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
                                            {statModalData.rows.length} {statModalData.rows.length === 1 ? 'registro' : 'registros'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">{statModalData.description}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setStatModalData(null)}
                                className="size-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
                                title="Cerrar modal"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        {/* Controles internos del Modal */}
                        <div className="p-4 bg-slate-50/30 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                            <div className="relative flex-1 min-w-[240px]">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                                <input
                                    type="text"
                                    placeholder="Filtrar por paciente, profesional, DNI, NUC, cobertura..."
                                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-xs font-semibold bg-white transition-all"
                                    value={statModalSearch}
                                    onChange={e => setStatModalSearch(e.target.value)}
                                />
                            </div>
                            {(planillaStartDate || planillaEndDate) && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold bg-slate-100 px-3 py-1.5 rounded-xl">
                                    <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
                                    <span>Filtro activo: {planillaStartDate || 'Inicio'} a {planillaEndDate || 'Hoy'}</span>
                                </div>
                            )}
                        </div>

                        {/* Tabla del Modal */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {(() => {
                                const q = statModalSearch.toLowerCase().trim();
                                const filteredModalRows = statModalData.rows.filter(row => {
                                    if (!q) return true;
                                    return (
                                        String(row.paciente || '').toLowerCase().includes(q) ||
                                        String(row.dni || '').toLowerCase().includes(q) ||
                                        String(row.nuc || '').toLowerCase().includes(q) ||
                                        String(row.profesional || '').toLowerCase().includes(q) ||
                                        String(row.cobertura || '').toLowerCase().includes(q) ||
                                        String(row.nro_hc || '').toLowerCase().includes(q)
                                    );
                                });

                                if (filteredModalRows.length === 0) {
                                    return (
                                        <div className="py-16 text-center">
                                            <span className="material-symbols-outlined text-5xl text-slate-200 mb-2">search_off</span>
                                            <p className="text-slate-400 font-bold uppercase text-xs">No se encontraron cirugías con los criterios de búsqueda</p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead className="bg-slate-100/80 border-b border-slate-200 sticky top-0 backdrop-blur-md">
                                                <tr>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Fecha Práctica</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Paciente</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Profesional</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Cobertura</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Fe Factur</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider">Fe Aoter</th>
                                                    <th className="px-3 py-3 font-black text-slate-600 uppercase tracking-wider text-center">Tipo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredModalRows.map((row, idx) => (
                                                    <tr key={row.admission_id + '-' + idx} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="px-3 py-3 font-bold text-slate-800 whitespace-nowrap">{row.fecha}</td>
                                                        <td className="px-3 py-3">
                                                            <div className="font-bold text-slate-900 uppercase">{row.paciente}</div>
                                                            <div className="text-[10px] text-slate-400 font-medium">
                                                                DNI: {row.dni} | NUC: {row.nuc} | HC: {row.nro_hc}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 font-semibold text-slate-700 uppercase">{row.profesional}</td>
                                                        <td className="px-3 py-3 font-bold text-slate-700 uppercase">
                                                            <span className={`px-2 py-0.5 rounded-md ${
                                                                String(row.cobertura).toUpperCase().includes('OSER') 
                                                                    ? 'bg-amber-100 text-amber-800 font-extrabold' 
                                                                    : 'bg-slate-100 text-slate-700'
                                                            }`}>
                                                                {row.cobertura}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 whitespace-nowrap">
                                                            {row.fe_factur ? (
                                                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                                                                    {row.fe_factur}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-300 font-medium">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 whitespace-nowrap">
                                                            {row.fe_aoter ? (
                                                                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold">
                                                                    {row.fe_aoter}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-300 font-medium">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-center whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                                row.is_guardia 
                                                                    ? 'bg-purple-100 text-purple-700' 
                                                                    : 'bg-blue-100 text-blue-700'
                                                            }`}>
                                                                {row.is_guardia ? 'Ambulatoria / Guardia' : 'Internación'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <p className="text-xs text-slate-500 font-medium">
                                Mostrando cirugías tomadas para este cálculo
                            </p>
                            <button
                                onClick={() => setStatModalData(null)}
                                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all shadow-md"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    #root { display: none !important; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; }
                    #print-billing-portal, #print-selected-rows { display: block !important; visibility: visible !important; position: static !important; }
                    @page { size: auto; margin: 1cm; }
                    .avoid-break { page-break-inside: avoid; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    img, .print-force-adjust { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; image-rendering: -webkit-optimize-contrast !important; }
                }
            ` }} />
        </div>
    );
};

export default Billing;
